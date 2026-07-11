/**
 * The SDD-DE procedure, in prose.
 *
 * These builders are the prompts VortSpec hands to Claude Code for every step of
 * the pre-DESIGN.md cycle (build one / build the rest, re-scan + reconcile, add a
 * new component, verify, resume, non-destructive refactor). They are pure strings
 * with no UI or Electron dependency and live in `@vortspec/core` so BOTH app
 * shells — the cockpit and the IDE — drive the identical procedure. Editing the
 * procedure here changes it in both apps at once (the binding invariant of the
 * two-app model).
 */

export function buildOnePrompt(name: string, level?: string): string {
  return (
    `Read .sdd-de/project.yaml. Implement the "${name}" component` +
    (level ? ` (${level})` : "") +
    " into component_dir in the configured framework and language, using ONLY the extracted " +
    "design tokens. Run /generate-artifacts for it to produce its specs, then implement it."
  );
}

/**
 * Every batch action is idempotent so an interrupted run resumes from the files:
 * re-running only does the work that isn't already on disk. This is the
 * local-first resume path — it survives an app restart because state lives in
 * the project, not memory.
 */
const RESUMABLE =
  "This may be resuming an interrupted run — first check what is already done from the files and " +
  "skip it: do NOT rebuild a component that already has a source file, do NOT re-generate specs " +
  "that already exist, and do NOT re-verify a component that already has an up-to-date " +
  "visual-verify-report.md. Only do the remaining work, then stop.";

export const BUILD_REMAINING_PROMPT =
  RESUMABLE +
  "\n\nRead .sdd-de/components.json and .sdd-de/project.yaml. Implement EVERY component listed in " +
  "components.json that is NOT yet implemented in component_dir, in the configured framework and " +
  "language, using ONLY the extracted design tokens. For each, run /generate-artifacts to produce " +
  "its specs, then implement it. Build in order: atoms → molecules → organisms. Skip components that " +
  "already have a source file.";

/**
 * Re-scan the design source and RECONCILE — additive, never destructive. Refresh
 * tokens and merge newly-detected components into the inventory so the roster
 * shows what's on the source vs. what's already built, without touching built
 * code or dropping hand-added components.
 */
export const RESCAN_PROMPT = [
  "Re-scan this project's design source and reconcile the design system. Do NOT implement or",
  "modify any component code — this only refreshes tokens and the component inventory.",
  "",
  "1. Read `.sdd-de/project.yaml` for `design_source` and the config. Connect to the configured",
  "   source. For `design_source: figma`, use the Figma MCP to read `figma_file_url` and the",
  "   variable collection `figma_token_collection`.",
  "2. Re-extract design tokens into the configured `token_file`: add newly-found tokens and update",
  "   values that changed. Do NOT remove tokens that existing components still reference.",
  "3. Detect EVERY component in the source and MERGE into `.sdd-de/components.json`:",
  "   - keep every existing entry (including components added by hand),",
  "   - add any component found in the source that isn't already listed ({ name, level, description }),",
  "   - for `design_source: figma`, record each entry's Figma node id as a `figmaNodeId` field (resolve it",
  "     via `figma_get_component_details`/`figma_search_components` by name) so component docs can be enriched",
  "     later without re-resolving — add/refresh it where missing or changed,",
  "   - do NOT delete entries and do NOT touch component source files.",
  "4. RECONCILE IMPLEMENTATION STATUS: for every existing entry whose description says it is",
  "   \"not yet implemented\" (or similar wording, e.g. \"discovered in a re-scan; not yet implemented\")",
  "   but which NOW has an implemented source file under the component dir, update that entry's",
  "   description to remove the stale status note and reflect that it is implemented — keep the",
  "   substantive text, correct only the status wording. Do NOT modify component source code.",
  "5. End with a one-line summary: how many components are in the inventory, how many are",
  "   implemented (have a source file under the component dir), how many are new since last scan,",
  "   and how many stale descriptions you corrected.",
].join("\n");

export function newComponentPrompt(name: string, intent: string): string {
  return [
    `Add a brand-new component "${name}" to this design system.`,
    "1. Append an entry to .sdd-de/components.json: { \"name\": \"" +
      name +
      "\", \"level\": <atom|molecule|organism>, \"description\": <one line from the intent below> }.",
    "2. Run /generate-artifacts for it to produce its specs.",
    "3. Implement it into component_dir in the configured framework and language, using ONLY the",
    "   extracted design tokens and matching the existing components' conventions.",
    "",
    "Intent:",
    intent,
  ].join("\n");
}

/**
 * Build a component from a SPECIFIC Figma node the user selected in Figma
 * Desktop (via figma-cli). Same gated SDD-DE cycle as `newComponentPrompt`, but
 * grounded in one authoritative node id — the engine reads that exact node
 * through the Figma MCP so the generated code matches what the user picked.
 */
export function newComponentFromFigmaNodePrompt(name: string, nodeId: string): string {
  return [
    `Build a component from the Figma node the user selected: "${name}" (node id ${nodeId}).`,
    `1. Read that exact node via the Figma MCP — resolve node id ${nodeId} in the file`,
    "   `figma_file_url` from .sdd-de/project.yaml (e.g. figma_get_component_details / a node fetch)",
    "   to get its structure, variants, and styles. Treat that node as authoritative.",
    `2. Append an entry to .sdd-de/components.json: { "name": "${name}", "level": <atom|molecule|organism>,`,
    `     "description": <one line>, "figmaNodeId": "${nodeId}" } — do NOT remove existing entries.`,
    "3. Run /generate-artifacts for it to produce its specs.",
    "4. Implement it into component_dir in the configured framework and language, using ONLY the",
    "   extracted design tokens and matching the existing components' conventions.",
    "Change nothing in Figma; only read.",
  ].join("\n");
}

/**
 * Verify is the CLI's autonomous QA — visual-verify + adversarial-review run
 * as one background agent session. The app provisions everything it needs (a
 * live render harness URL + the Figma MCP) so it never hands the visual-verify
 * checklist back to the user as manual steps.
 */
function harnessClause(url: string | null): string {
  return url
    ? `The live component is served at ${url} — load it there to inspect it.`
    : "No live preview server is available; run the code-level audit (grep for hardcoded " +
        "hex/px, check every variant/state and a11y in the source, verify spec compliance) and " +
        'record any browser-only check as "pending" in the report — do NOT ask me to start a server.';
}
function figmaClause(isFigma: boolean): string {
  return isFigma
    ? "Use the Figma MCP (figma_file_url in .sdd-de/project.yaml) to read the authoritative design " +
        "and screenshots for the comparison."
    : "Compare against each component's spec and its source files (design_source is not Figma).";
}
const NO_MANUAL_STEPS =
  "Do this entirely yourself, in the background — never tell me to open a browser, open Figma Dev " +
  "Mode, start a server, or run a command. You have the tools; use them.";

/**
 * Non-destructive parallel refactor (M4): duplicate the repo's existing screens onto
 * the built design system as NEW parallel files — never edit/move/delete originals.
 * Delivered additively (publish from Source Control on a new branch + PR).
 */
export const REFACTOR_PROMPT = [
  "Non-destructively refactor this project's existing screens/pages onto the built design system",
  "(the components under the component dir + the design tokens + DESIGN.md). This is ADDITIVE — never",
  "edit, move, rename, or delete any existing file.",
  "",
  "1. Discover the existing screens/pages and the UI they compose (routes, page components, top-level views).",
  "2. For EACH existing screen, generate a NEW, parallel implementation that renders the same screen using",
  "   ONLY the built token-driven components (import them from the component dir) and the design tokens — no",
  "   hardcoded hex/px. Write each as a NEW file in a clearly separated namespace so old and new coexist:",
  "   prefer a `vortspec/` route/dir tree mirroring the originals, or a `<Screen>.vortspec.<ext>` sibling.",
  "   Read DESIGN.md as the hand-off. Match each screen's layout and content faithfully.",
  "3. Do NOT modify, move, or delete the originals, their routes, or their imports — the app must still build",
  "   and run exactly as before; the new screens are additive and NOT yet wired in.",
  "4. Write `MIGRATION.md` at the project root: a table mapping each original screen → its new duplicate file,",
  "   plus the exact switch-over steps (which import/route to change to adopt each new screen). State clearly",
  "   that the cutover is a deliberate manual step for the team.",
  "5. End with a one-line summary: how many screens you found and how many parallel duplicates you created.",
  "",
  "When done, publish from Source Control on a new branch + PR — never to main; the originals stay intact.",
].join("\n");

/** Resumes an interrupted run's own Claude Code session (via --resume). */
export const RESUME_PROMPT =
  "Continue exactly where the previous run stopped. Re-check what is already complete from the " +
  "files and skip it — do not redo finished work. Finish only the remaining steps, then stop. " +
  NO_MANUAL_STEPS;

export function verifyPrompt(target: string, url: string | null, isFigma: boolean): string {
  const scope = target === "all" ? "every built component" : `the "${target}" component`;
  return [
    ...(target === "all" ? [RESUMABLE] : []),
    `Run visual verification for ${scope} autonomously.`,
    `1. /visual-verify for ${scope}: compare the implementation to its spec across 375/768/1440px, ` +
      `check every token/variant/state, and run the accessibility audit. ${harnessClause(url)} ${figmaClause(isFigma)}`,
    `2. /adversarial-review for ${scope}: red-team tokens (grep hardcoded hex/px), variant/state ` +
      `coverage, accessibility, and spec compliance.`,
    "3. Fix any discrepancies inline, then write specs/<component>/visual-verify-report.md and the " +
      "adversarial-review report.",
    NO_MANUAL_STEPS,
    target === "all"
      ? "End with one line per component: '<name>: PASS' or '<name>: ISSUES (n)'."
      : "End with one line: 'VERIFY: PASS' or 'VERIFY: ISSUES (n)'.",
  ].join("\n");
}

// ── Chunked builds (change: component-chunking-and-workspace-ergonomics) ──

/** The minimal component shape the chunk helpers need. */
export interface ChunkComponent {
  name: string;
  /** atom | molecule | organism (case-insensitive); anything else sorts last. */
  level?: string | null;
}

/** The model tiers VortSpec routes builds to. Never opus/fable for repetitive builds. */
export type BuildTier = "haiku" | "sonnet";

const LEVEL_RANK: Record<string, number> = { atom: 0, molecule: 1, organism: 2 };
function levelRank(level?: string | null): number {
  return LEVEL_RANK[(level ?? "").toLowerCase()] ?? 3;
}

/**
 * Split the components into build chunks of at most `size`, atoms → molecules →
 * organisms. The sort is stable (original order preserved within a level), so
 * sequential slicing keeps each chunk homogeneous by level except where a level
 * boundary falls mid-chunk. This is the unit the guided flow builds one run at a
 * time so partial results (Storybook + manifest) land after every chunk.
 */
export function chunkByLevel<T extends ChunkComponent>(components: T[], size = 5): T[][] {
  const ordered = components
    .map((c, i) => ({ c, i }))
    .sort((a, b) => levelRank(a.c.level) - levelRank(b.c.level) || a.i - b.i)
    .map((x) => x.c);
  const chunks: T[][] = [];
  for (let i = 0; i < ordered.length; i += size) chunks.push(ordered.slice(i, i + size));
  return chunks;
}

/**
 * Route a chunk by complexity: a chunk containing an organism gets Sonnet, an
 * atoms/molecules-only chunk gets Haiku. Component work is straightforward and
 * repetitive, so it never routes to Opus/Fable.
 */
export function tierForChunk(chunk: ChunkComponent[]): BuildTier {
  return chunk.some((c) => levelRank(c.level) === 2) ? "sonnet" : "haiku";
}

export interface BuildChunkOptions {
  /** The design source URL (Figma) for the verify comparison, if any. */
  url?: string | null;
  /** Whether the design source is Figma (drives the verify comparison clause). */
  isFigma?: boolean;
  /** Also run /visual-verify + /adversarial-review per component in this chunk. */
  verify?: boolean;
  /** Regenerate Storybook stories for this chunk's components after building. */
  storybook?: boolean;
  /** Refresh the design manifest (DESIGN.md) after building this chunk. */
  manifest?: boolean;
}

/**
 * Build a SPECIFIC set of components (one chunk) in a single run, then optionally
 * verify them, regenerate their Storybook stories, and refresh DESIGN.md — so the
 * chunk yields something usable before the rest of the roster is built. Scoped to
 * the named components only; other detected components are left untouched.
 */
export function buildChunkPrompt(names: string[], opts: BuildChunkOptions = {}): string {
  const list = names.map((n) => `"${n}"`).join(", ");
  const lines: string[] = [
    RESUMABLE,
    "",
    "Read .sdd-de/components.json and .sdd-de/project.yaml. Build ONLY these components, in " +
      `atoms → molecules → organisms order: ${list}. Do NOT build any other component in this run.`,
    "For EACH of them, run /generate-artifacts to produce its specs, then implement it into " +
      "component_dir in the configured framework and language, using ONLY the extracted design tokens. " +
      "Skip any that already have a source file.",
  ];
  if (opts.verify) {
    lines.push(
      "Then verify each of them: /visual-verify then /adversarial-review; fix discrepancies inline and " +
        `write specs/<component>/visual-verify-report.md and the adversarial report. ${harnessClause(
          opts.url ?? null,
        )} ${figmaClause(!!opts.isFigma)}`,
    );
  }
  if (opts.storybook) {
    lines.push(
      "Then run /storybook to add or update Storybook stories for these components (leave existing " +
        "stories for other components as they are).",
    );
  }
  if (opts.manifest) {
    lines.push(
      "Then run /design-doc to refresh DESIGN.md so it reflects the components built so far.",
    );
  }
  lines.push(NO_MANUAL_STEPS);
  lines.push("End with one line per component: '<name>: PASS' or '<name>: ISSUES (n)'.");
  return lines.join("\n");
}

/** Build every not-yet-built component AND verify it — the CLI's Apply → Verify chain. */
export function buildVerifyRestPrompt(url: string | null, isFigma: boolean): string {
  return [
    RESUMABLE,
    "Read .sdd-de/components.json and .sdd-de/project.yaml. For EVERY component listed that is NOT " +
      "yet implemented in component_dir, in atoms → molecules → organisms order, run the full SDD-DE " +
      "cycle autonomously and in the background:",
    "  a. /generate-artifacts to produce its specs, then implement it using ONLY the extracted design tokens.",
    `  b. /visual-verify then /adversarial-review for it. ${harnessClause(url)} ${figmaClause(isFigma)}`,
    "  c. Fix any discrepancies inline; write specs/<component>/visual-verify-report.md and the adversarial report.",
    "Skip components that already have a source file. " + NO_MANUAL_STEPS,
    "End with one line per component: '<name>: PASS' or '<name>: ISSUES (n)'.",
  ].join("\n");
}

// ── Re-runnable Foundation: add a source, Clean-sweep vs Merge (change: ide-guided-flow-parity) ──

/** How re-running the Foundation against a new source reconciles with the existing one. */
export type FoundationMode = "clean-sweep" | "merge";

/** An additional design source to (re)run the Foundation against. */
export interface AddedSource {
  /** `figma` = a Figma file URL read via the Figma MCP / figma-cli; `local` = a folder/zip path. */
  kind: "figma" | "local";
  /** The Figma file URL, or the local folder/zip path. */
  ref: string;
}

/** A human phrase for the source, used in the prompt. */
function sourceClause(source: AddedSource): string {
  return source.kind === "figma"
    ? `the Figma file at ${source.ref} (connect via the Figma MCP / figma-cli to read it)`
    : `the local design source at \`${source.ref}\` (a folder or zip of components/tokens)`;
}

/**
 * Re-run the design-system Foundation against an ADDITIONAL source. `clean-sweep`
 * replaces the current tokens + component inventory from the new source; `merge`
 * is additive — it adds newly-found tokens/components (deduped by name) and, for a
 * same-NAME token/component that differs, **flags the conflict** rather than
 * overwriting. Never touches component source files.
 */
export function addSourcePrompt(mode: FoundationMode, source: AddedSource): string {
  const where = sourceClause(source);
  if (mode === "clean-sweep") {
    return [
      RESUMABLE,
      `Rebuild this project's design-system Foundation from ${where}, REPLACING the current one.`,
      "1. Extract design tokens from this source into the configured `token_file`, replacing the existing token set.",
      "2. Detect EVERY component in this source and REWRITE `.sdd-de/components.json` to match it ({ name, level, description }).",
      "3. Do NOT implement or modify any component source files.",
      NO_MANUAL_STEPS,
      "End with a summary: token count, component count.",
    ].join("\n");
  }
  return [
    RESUMABLE,
    `MERGE ${where} into this project's EXISTING design system — additive, never destructive.`,
    "1. Read `.sdd-de/project.yaml` for the config, then read the current `token_file` and `.sdd-de/components.json`.",
    "2. Extract tokens from the new source and reconcile into `token_file`: ADD newly-found tokens. For a token whose " +
      "NAME already exists but with a DIFFERENT value, DO NOT overwrite — FLAG it as a conflict (name, existing value, new value).",
    "3. Detect components in the new source and MERGE into `.sdd-de/components.json`, deduped by name: add entries not " +
      "already listed. For a same-NAME component that differs, FLAG the conflict; do NOT delete entries or touch component source files.",
    NO_MANUAL_STEPS,
    "End with a summary: tokens added, components added, and every flagged conflict (token or component name + both values).",
  ].join("\n");
}
