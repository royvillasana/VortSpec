/**
 * Prompts for the screen ↔ Figma round-trip (change: add-screen-to-figma). Parallel to the
 * token push's `pushPrompt` — pre-scoped, skill-anchored prompts for a gated Claude Code run
 * that talks to the user's own Figma MCP. VortSpec never calls Figma directly; these instruct
 * the run to do the work and report back the ids VortSpec persists in `.vortspec/maps/screens.json`.
 */

export interface SendScreenPromptInput {
  /** The previewed screen's source file (project-relative). */
  file: string;
  /** The running preview URL — the pixel/image reference source. */
  previewUrl: string | null;
  /** The target Figma file key: the project's design-system file, or a previously-used one. Null → create one. */
  fileKey: string | null;
  /** The screen's existing frame node id, when this is a re-send (update in place). */
  nodeId: string | null;
  /** A human label for the screen (route path or component name). */
  screenLabel: string;
}

/** Build the send (code → design) prompt. */
export function buildSendScreenPrompt(input: SendScreenPromptInput): string {
  const { file, previewUrl, fileKey, nodeId, screenLabel } = input;
  return [
    `Send the screen "${screenLabel}" (source: ${file}) to Figma as a design-system-linked view.`,
    "",
    "Follow the figma-generate-design skill (load it first, alongside figma-use). Rules:",
    fileKey
      ? `1. Target the EXISTING Figma file ${fileKey} — the project's design-system file, where the components live. Place the screen on a page/section named "Screens" inside it. Do NOT create a new file.`
      : `1. No design-system file is recorded — first load figma-create-new-file and create a file named "VortSpec — Screens", then build into it. Return its fileKey.`,
    nodeId
      ? `2. This is a RE-SEND: update the existing frame ${nodeId} in place (figma-generate-design Step 6 "Updating an Existing View"); do NOT create a duplicate.`
      : "2. Build the screen as a new frame.",
    "3. Compose it from the design system's components: for each code component the screen uses, instance the MAPPED Figma component. The components are LOCAL to the file — resolve each by the `figmaNodeId` recorded in `.sdd-de/components.json` and instance it directly (figma.getNodeByIdAsync(nodeId) → createInstance()). Use importComponentSetByKeyAsync(componentKey) ONLY as a fallback for a published/remote library component. Only hand-build a frame for an element that has no mapped component.",
    "4. Bind colors, spacing, and radii to the design system's variables and apply text/effect styles — never hardcode hex/px when a token exists. Read the project's token file for the values.",
    previewUrl
      ? `5. The screen renders at ${previewUrl}. For its images: if your Figma connector exposes generate_figma_design, run it against the SAME fileKey in parallel to capture the running app, transfer the imageHashes into your instances, then delete the capture (reference only). If generate_figma_design is NOT available, download the image bytes from the running app and import them directly with upload_assets as image fills. Either way, do not leave image frames blank.`
      : "5. For any images: if generate_figma_design is available use it as a reference capture (transfer imageHashes, then delete it); otherwise import the image bytes directly with upload_assets. Do not leave image frames blank.",
    "6. Validate with get_screenshot SPARINGLY — once on the assembled frame near the end, not after every section.",
    "",
    "SPEED — each Figma MCP call is a slow round-trip; keep them to a minimum:",
    "  • Resolve components from `.sdd-de/components.json` (a local file, one Bash read) and use those `figmaNodeId`s DIRECTLY — do NOT spend use_figma calls rediscovering component keys.",
    "  • Do AT MOST ONE read-only use_figma inspection call to gather the variable collections, text/effect styles, and font families, then stop inspecting.",
    "  • Build MULTIPLE sections per use_figma call (batch them) rather than one call per section.",
    "  • Do not re-screenshot after every step; a single end validation is enough.",
    "",
    "When done, output EXACTLY one final line of JSON and nothing after it, so the cockpit can record the mapping:",
    '  RESULT: { "fileKey": "<the file key>", "nodeId": "<the screen frame node id>", "url": "<the figma.com URL to the frame>" }',
  ].join("\n");
}

export interface PullScreenPromptInput {
  /** The screen's source file to update (project-relative). */
  file: string;
  /** The Figma file key holding the screen's frame. */
  fileKey: string;
  /** The screen's frame node id in Figma. */
  nodeId: string;
  /** A human label for the screen. */
  screenLabel: string;
}

/** Build the pull-back (design → code) prompt. */
export function buildPullScreenPrompt(input: PullScreenPromptInput): string {
  const { file, fileKey, nodeId, screenLabel } = input;
  return [
    `Pull the Figma design changes for the screen "${screenLabel}" back into its source file ${file}.`,
    "",
    "Follow the figma-design-to-code skill (load it first). Rules:",
    `1. Read the current design with get_design_context on fileKey ${fileKey}, nodeId ${nodeId}.`,
    "2. Adapt the changes into the EXISTING screen source at " +
      file +
      " — reuse the project's own design-system components and design tokens (do not introduce raw markup or hardcoded values where a component/token exists). Preserve the screen's data flow, props, and behavior; change only what the design changed (layout, spacing, content, variants, added/removed elements).",
    "3. Make the minimal edit that reflects the design. Do NOT restyle unrelated parts of the app or edit other files unless strictly required.",
    "4. Report a short summary of what changed. Do not commit or run git.",
  ].join("\n");
}

/** Parse the trailing `RESULT: { … }` line the send run emits. Null when absent/malformed. */
export function parseSendResult(text: string): { fileKey: string; nodeId: string; url?: string } | null {
  const m = text.match(/RESULT:\s*(\{[\s\S]*\})\s*$/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as { fileKey?: unknown; nodeId?: unknown; url?: unknown };
    if (typeof j.fileKey === "string" && typeof j.nodeId === "string" && j.fileKey && j.nodeId) {
      return { fileKey: j.fileKey, nodeId: j.nodeId, url: typeof j.url === "string" ? j.url : undefined };
    }
  } catch {
    /* malformed */
  }
  return null;
}
