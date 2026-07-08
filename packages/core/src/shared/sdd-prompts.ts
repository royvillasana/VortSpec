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
