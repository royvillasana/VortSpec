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
    " into component_dir in the configured framework and language. " +
    DESIGN_REFERENCE_CLAUSE +
    " Run /generate-artifacts for it to produce its specs, then implement it. " +
    VARIANT_SET_CLAUSE
  );
}

/** Shared reminder so a collapsed variant set is ONE component, not many. */
const VARIANT_SET_CLAUSE =
  "If its .sdd-de/components.json entry has a `variants` array (variant axes), implement a SINGLE " +
  "component that covers ALL those variants via variant props (e.g. CVA), not a separate component per variant.";

/**
 * The design anchor (change: figma-visual-validation, hardened in figma-node-reference).
 * A build must REPRODUCE the component's authoritative Figma design, not invent a shape
 * from its name. The reference is the component's own Figma NODE (its component set),
 * resolved AUTONOMOUSLY — never by asking the user for a link. Detection records each
 * entry's `figmaNodeId`/`componentKey`; the build reads that exact node. When the id is
 * missing, the build resolves it itself via `search_design_system` (scoped to this
 * file's own library) — which is NOT subject to the 3-page listing cap. Tokens supply
 * VALUES only; the reference supplies STRUCTURE. This is what stops "the alert looks
 * like a restyled button."
 */
const DESIGN_REFERENCE_CLAUSE = [
  "DESIGN REFERENCE — do this BEFORE writing code, entirely yourself (never ask me for a Figma link): if",
  "project.yaml's `design_source` is `figma`, the authoritative reference for a component is its own Figma",
  "NODE (the component set). RESOLVE it in this order: (1) the entry's `figmaNodeId`/`componentKey` in",
  ".sdd-de/components.json — read that exact node via the Figma MCP (get_design_context / get_screenshot);",
  "(2) if that is missing, resolve the node yourself with `search_design_system` scoped to THIS file's own",
  "library (from `figma_file_url`) — it returns the component by name and is NOT capped like the page",
  "listing; (3) the Desktop Bridge (figma-console) if connected. Do NOT rely on the remote page listing to",
  "locate it — that CAPS AT 3 pages. Read the resolved node's frames/variants and view its screenshot, and",
  "REPRODUCE that design — structure, parts, and every variant. Use the extracted design tokens ONLY for",
  "VALUES (color/spacing/radius/typography) and use the component's OWN design tokens (e.g. the",
  "`--component-<name>-*` semantic tokens) where the design system defines them — do NOT hardcode a hex/rgba",
  "or invent a value. Do NOT infer the component's shape from its name, and do NOT copy a different existing",
  "component (an alert is NOT a restyled button). The component's own node reference takes precedence over",
  "the design-system index. If the node truly cannot be resolved by any method, do NOT fabricate from the",
  "name: build nothing and report it unreferenced, so it is never mistaken for a design-matched component.",
].join(" ");

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
  "language. " +
  DESIGN_REFERENCE_CLAUSE +
  " For each, run /generate-artifacts to produce its specs, then implement it. Build in order: " +
  "atoms → molecules → organisms. Skip components that already have a source file.";

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
  "   source. For `design_source: figma`, ENUMERATE THE WHOLE FILE — every page and every component,",
  "   not a subset. PREFER the Figma Desktop Bridge (the figma-console plugin) when it is connected: it",
  "   lists ALL pages via `figma.root.children` and gives a complete component + variable dump on any",
  "   Figma plan. CRITICAL: the remote/official Figma MCP's page listing CAPS AT 3 PAGES — never treat",
  "   that first-3 listing as the file's page set (that is the exact bug that made a 14-page,",
  "   page-per-component library detect as only ~8 doc/foundation entries). If the Desktop Bridge is",
  "   unavailable, still cover EVERY page: read the full document / use `search_design_system` +",
  "   `figma_get_design_system_summary` for the complete component inventory — do NOT stop at the capped",
  "   page listing. Read `figma_file_url` and the variable collection `figma_token_collection` PLUS the",
  "   text/color STYLES. Fetch VARIABLES + STYLES (not code generation), and NEVER fabricate a value.",
  "2. Re-extract design tokens into the configured `token_file` from the FULL variable collection + styles:",
  "   add newly-found tokens and update values that changed. NEVER guess or approximate a value — if one",
  "   truly can't be read, OMIT it and note it, never fabricate a value. Do NOT remove tokens that existing",
  "   components still reference.",
  "3. Detect the PUBLIC components in the source and MERGE into `.sdd-de/components.json`:",
  "   - keep every existing entry (including components added by hand),",
  "   - add any component found in the source that isn't already listed ({ name, level, description, variants? }),",
  "   - COLLAPSE VARIANTS — do NOT add one entry per variant:",
  "       · a Figma COMPONENT_SET is ONE component — one entry named after the set, with its variant AXIS names",
  "         in a `variants` array (e.g. { \"name\": \"button\", \"variants\": [\"type\", \"size\"] });",
  "       · components sharing a slash-separated prefix (e.g. `form-item/horizontal/input`, `form-item/vertical/select`)",
  "         are variants of ONE component — one entry named after the shared base (`form-item`) with the differing",
  "         path segments as axes (`\"variants\": [\"orientation\", \"control\"]`), NOT one entry per combination;",
  "   - EXCLUDE internal sub-components and styles — apply this BEFORE adding, and REMOVE any such entry a prior",
  "     scan already added (this is a case where you may delete stale entries). DROP a node when it is:",
  "       · underscore-prefixed (e.g. `_carousel-item`, `_input-base`) — a private/internal part; or",
  "       · dot-prefixed (e.g. `.largeTitle`, `.smallTitle`) — those are text/COLOR STYLES: put them in the token",
  "         file as typography/color tokens, NOT in the component inventory; or",
  "       · used ONLY as a child inside ONE other component and never placed on its own — a sub-part of its parent",
  "         (e.g. navbar-brand/navbar-toggler/navbar-collapse belong to `navbar`; carousel-item/indicator to",
  "         `carousel`; dropdown-menu-item to `dropdown-menu`; input-affix/addon/cursor/separator to `input`).",
  "         Fold these into the parent, do NOT list them as separate components.",
  "     The `components/` folder prefix is NOT by itself an internal marker — judge by composition, not the folder.",
  "     Detect the PUBLIC, standalone design-system components only.",
  "   - if a PRIOR scan wrongly split a set into per-variant rows (e.g. many `form-item/*` entries), REPLACE them",
  "     with the single collapsed entry (this is the one case where you may remove stale entries),",
  "   - for `design_source: figma`, record each entry's Figma node id as a `figmaNodeId` field (resolve it",
  "     via `figma_get_component_details`/`figma_search_components` by name) so component docs can be enriched",
  "     later without re-resolving — add/refresh it where missing or changed,",
  "   - PAGE-PER-COMPONENT REFERENCE (authoritative design anchor): the file follows the convention that each",
  "     PAGE is one component and holds that component with all its variations (a page \"accordion\" = the",
  "     accordion + its variant frames). Match each roster entry to its page by NORMALIZED name (case/separator-",
  "     insensitive) and record `figmaPage` (the page name) and `figmaPageId` (its node id) on the entry. If a",
  "     roster component has NO page bearing its name, set `\"unreferenced\": true` on it and note it in the",
  "     summary — do NOT invent a page or point it at another component's page. Utility pages (Cover,",
  "     Typography, Icons, etc.) that name no component are NOT component references.",
  "   - do NOT delete other entries and do NOT touch component source files.",
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
    ? `The live component is served at ${url} — load it there and actually render/inspect it; ` +
        "the rendered appearance, every variant/state as drawn, focus rings, and responsive layout " +
        "at 375/768/1440 must be checked against the live surface, not just the source."
    : "No live preview server is available, so the RENDERED checks (appearance, every variant/state " +
        "as drawn, focus rings, responsive layout at 375/768/1440) CANNOT be performed. Do the " +
        "source-level audit you can (grep hardcoded hex/px, check variants/states + a11y in the code, " +
        "verify spec compliance) and LIST every visual check you could not run. This is a PARTIAL " +
        "verify — you MUST NOT report PASS; the verdict is BLOCKED. Do NOT ask me to start a server.";
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
  const resolveRef = isFigma
    ? "RESOLVE each component's authoritative Figma reference YOURSELF — never ask me for a link. Use, in " +
      "order: (1) the entry's `figmaNodeId`/`componentKey` in .sdd-de/components.json, read via the Figma MCP " +
      "(get_design_context / get_screenshot on that node); (2) if missing, `search_design_system` scoped to " +
      "THIS file's own library (from `figma_file_url`) to resolve the node by name — it is NOT capped like the " +
      "page listing; (3) the Desktop Bridge if connected. Do NOT use the remote page listing (caps at 3)."
    : "Compare against the component's spec and design source (design_source is not Figma).";
  const compareTo = isFigma
    ? "the component's authoritative Figma node (resolved as above), screenshot included"
    : "the component's spec and design source";
  return [
    ...(target === "all" ? [RESUMABLE] : []),
    `Run verification for ${scope} autonomously, as THREE layers reported in this order — VISUAL, then ` +
      `TOKEN, then CODE. ${scope} is "verified" only when ALL THREE pass on real evidence; report each ` +
      `layer's outcome independently and never let a green layer mask a failing one. ${resolveRef}`,
    `Layer 1 — VISUAL FIDELITY (the primary check): run /visual-verify for ${scope} — render it live and ` +
      `compare it, every variant and ` +
      `state, to ${compareTo}. ${harnessClause(url)} Render at 375/768/1440px, ` +
      `screenshot each variant/state, and compare to the reference; a component that COMPILES and uses ` +
      `tokens but does NOT match its reference FAILS this layer — call out the concrete differences (missing ` +
      `parts/slots, wrong container shape, wrong border/radius/height, absent variants, wrong proportions, an ` +
      `addon/affix rendered plainly when the design shows an attached segment), not a bare verdict. ` +
      `${figmaClause(isFigma)}`,
    `Layer 2 — TOKEN CORRECTNESS: confirm ${scope} uses the design tokens the resolved reference specifies ` +
      `(color/spacing/radius/typography), INCLUDING the component's own semantic tokens (e.g. ` +
      `\`--component-<name>-*\`) where the design system defines them. Grep for hardcoded hex/rgb/rgba/px and ` +
      `wrong-token substitutions across the component AND its \`*.variants.*\` file, and flag each with the ` +
      `exact token that should have been used. Any hardcoded color (e.g. a raw #83bcc7 or rgba(...) focus ring) ` +
      `is a TOKEN failure, even if it looks right.`,
    `Layer 3 — CODE / BUILD: run the project's type-check — 'npx tsc --noEmit' — and, for a Storybook/` +
      `library project with no dev server, also 'npm run build-storybook' (or the project's build script). ` +
      `${scope} MUST compile/build with zero errors. Any type or build error (a broken import, an interface ` +
      `imported as a value instead of 'import type', a duplicate JSX attribute, a missing export, an ` +
      `unresolved token) is a blocking defect — fix it inline and re-run until clean. Code that does not ` +
      `compile is ISSUES; and because it can't be rendered, Layer 1 is then BLOCKED.`,
    `Then /adversarial-review for ${scope} (red-team tokens, variant/state coverage, accessibility, spec ` +
      `compliance). Fix discrepancies inline, then write specs/<component>/visual-verify-report.md. That ` +
      `report MUST include a machine-readable block: one line each 'VISUAL: pass|fail|blocked', 'TOKEN: ` +
      `pass|fail', 'CODE: pass|fail', and a final 'VERIFY: PASS' / 'VERIFY: ISSUES (<failing layers>)' / ` +
      `'VERIFY: BLOCKED (<what>)'. Also write the adversarial-review report.`,
    NO_MANUAL_STEPS,
    `Report PASS only if ${scope} COMPILES/BUILDS cleanly AND you ACTUALLY rendered and inspected the ` +
      `live component and compared it to the authoritative design (all three layers passing on real ` +
      `evidence). Code that does not compile is ISSUES; a source-only / grep audit with no render is ` +
      `BLOCKED. Never claim a check you did not perform, never report PASS on code you did not compile, ` +
      `and never report a visual pass you did not render-and-compare.`,
    target === "all"
      ? "End with one line per component: '<name>: PASS', '<name>: ISSUES (visual|token|code: <what failed>)', or '<name>: BLOCKED (<what you could not verify>)'."
      : "End with one line: 'VERIFY: PASS', 'VERIFY: ISSUES (visual|token|code: <what failed>)', or 'VERIFY: BLOCKED (<what you could not verify>)'.",
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
    DESIGN_REFERENCE_CLAUSE,
    "For EACH of them, run /generate-artifacts to produce its specs, then implement it into " +
      "component_dir in the configured framework and language. Skip any that already have a source file.",
    VARIANT_SET_CLAUSE,
  ];
  if (opts.verify) {
    lines.push(
      "Then verify each of them in three layers, reported in order — VISUAL, then TOKEN, then CODE. " +
        "VISUAL: run /visual-verify — render it live and compare every variant/state to its authoritative " +
        "Figma reference (the page named after the component); call out concrete differences, and a component " +
        "that does not match its reference is ISSUES even if it compiles. TOKEN: confirm it uses the design " +
        "tokens (no hardcoded hex/px). CODE: it must type-check/build cleanly. Then /adversarial-review; fix discrepancies inline " +
        `and write specs/<component>/visual-verify-report.md (recording the three layer outcomes) and the ` +
        `adversarial report. ${harnessClause(opts.url ?? null)} ${figmaClause(!!opts.isFigma)}`,
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
    "  a. " + DESIGN_REFERENCE_CLAUSE,
    "  b. /generate-artifacts to produce its specs, then implement it.",
    `  c. Verify in three layers reported in order — VISUAL (/visual-verify: render and compare every ` +
      `variant/state to its authoritative Figma reference; a mismatch is ISSUES even if it compiles), TOKEN (uses design tokens, ` +
      `no hardcoded hex/px), CODE (type-checks/builds cleanly) — then /adversarial-review. ${harnessClause(url)} ${figmaClause(isFigma)}`,
    "  d. Fix any discrepancies inline; write specs/<component>/visual-verify-report.md (recording the three " +
      "layer outcomes) and the adversarial report.",
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
