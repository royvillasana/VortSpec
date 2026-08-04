/**
 * Figma file hygiene — the intake gate that runs BEFORE any component is built.
 *
 * Why this exists. `DESIGN_REFERENCE_CLAUSE` (sdd-prompts.ts) anchors every build to a
 * component's own Figma NODE, preferring the `figmaNodeId`/`componentKey` recorded on its
 * `.sdd-de/components.json` entry. Measured across the five real projects on disk, **zero of
 * 242 entries carry that field** — so resolution always falls through to a fuzzy
 * `search_design_system` name lookup, re-run per component per build. Two runs can resolve the
 * same component to two different nodes and both report PASS.
 *
 * That makes Figma naming quality the de-facto accuracy mechanism, silently. This module is the
 * contract that WOULD remove the dependency: the audit resolves each roster component to a real
 * node id, and `rosterPatchFromAudit` returns the shape a caller would persist. NOTHING CALLS IT
 * YET — see `buildFigmaHygieneAuditPrompt`. Until a caller exists, every production build still
 * resolves through the fuzzy path, and this header would be describing an integration that does
 * not exist if it said otherwise.
 *
 * FRAMEWORK-NEUTRAL BY CONSTRUCTION. These prompts never mention React, CVA, props, or any
 * framework idiom. A Figma component set with named variant axes already maps cleanly to every
 * target we support — CVA variants in React, `defineProps` unions in Vue, `$props()` in Svelte,
 * signal `input()` in Angular. Shaping the design file for one framework would push the same
 * React bias one layer upstream, which is the root cause this work exists to remove.
 *
 * Parallel in shape to `figma-screen-prompts.ts`: pure strings, no UI or Electron dependency,
 * a gated Claude Code run talks to the user's own Figma MCP, and a trailing `RESULT:` line
 * carries back the structured facts the app persists. VortSpec never calls Figma directly.
 */

/** A roster component the audit must account for, from `.sdd-de/components.json`. */
export interface HygieneRosterEntry {
  name: string;
  /** Already-recorded node id, when the entry has one — the audit re-verifies rather than re-resolves. */
  figmaNodeId?: string | null;
}

export interface HygieneAuditInput {
  /** The project's Figma file URL (`figma_file_url` in project.yaml). */
  fileUrl: string;
  /**
   * The library key this file's own components belong to, when it is already known.
   *
   * Required to emit a roster patch, and deliberately an INPUT rather than something the audit
   * infers. Inferring it from an initial unscoped `search_design_system` would be circular: that
   * is the exact result set proven to contain twenty unrelated libraries, so the inference would
   * be drawn from the evidence it is meant to filter. Name matching is no better — the measured
   * file is "Design Engineering System | Small" while its library reports as "Design Engineering
   * System".
   *
   * When absent the audit still runs and REPORTS the library keys it observed, so a human can
   * establish the value once; it just cannot produce a patch. See {@link rosterPatchFromAudit}.
   */
  expectedLibraryKey?: string | null;
  /** The roster to account for. Empty means "audit the whole file and report what you find". */
  roster: HygieneRosterEntry[];
  /** Whether the Figma Desktop Bridge (figma-console) is connected — it lists ALL pages. */
  bridgeConnected: boolean;
}

/**
 * The checks, in the order the audit reports them. Each is here because it breaks something
 * concrete downstream — not because it is tidy. `blocking` means a build cannot be accurate
 * without it; `advisory` degrades quality but still produces a correct component.
 */
const CHECKS = [
  "1. NODE RESOLUTION (blocking) — every roster component resolves to exactly ONE component or",
  "   component set, and you can state its node id. Ambiguous (two nodes match the name) and",
  "   missing (no node matches) are BOTH failures; report which, and never pick one arbitrarily.",
  "2. PAGE ANCHOR (blocking) — the file follows one-page-per-component: a page named for the",
  "   component holds it with all its variations. Report the page name + id per component, and",
  "   flag components whose page is missing or shared with an unrelated component. Utility pages",
  "   (Cover, Typography, Icons, Foundations) name no component and are not anchors.",
  "3. VARIANT AXES (blocking) — a component set's variant properties are NAMED, not Figma's",
  "   auto-generated placeholders. `Property 1`, `Property 2`, `Type=Default` are failures; the",
  "   axis names are what a build turns into the component's variant API, so an unnamed axis",
  "   produces an unnamed variant in every framework. Report each set's axes and their values.",
  "4. VARIANT VALUES (advisory) — values are meaningful (`primary`/`secondary`, `sm`/`md`/`lg`),",
  "   not `Variant2`/`Default 3`. Report placeholder-looking values; do not guess replacements.",
  "5. VARIABLE BINDING (blocking for fidelity) — design VALUES (fill, stroke, corner radius,",
  "   spacing, typography) are bound to Figma VARIABLES rather than raw literals. A raw hex on a",
  "   component's fill has no token to bind to, so the build must either hardcode it or invent a",
  "   token. Report the count of unbound value slots per component, with examples.",
  "6. DESCRIPTIONS (advisory) — each component set carries a description. It is what component",
  "   docs and the roster read; absent is a quality gap, not an accuracy one.",
  "7. PUBLIC SURFACE (advisory) — internal parts are marked as such, so they do not leak into the",
  "   roster as standalone components: underscore-prefixed (`_input-base`) for private parts,",
  "   dot-prefixed (`.largeTitle`) for text/color styles. Report public-looking nodes that are",
  "   only ever used INSIDE one other component — they are sub-parts, not components.",
] as const;

/** How to enumerate the file without hitting the remote MCP's 3-page listing cap. */
function enumerationClause(bridgeConnected: boolean): string {
  return bridgeConnected
    ? "The Figma Desktop Bridge (figma-console) is connected — enumerate via it: it lists ALL pages " +
        "through `figma.root.children` and gives a complete component + variable dump on any Figma plan. " +
        "Use `figma_audit_design_system`, `figma_lint_design`, and `figma_analyze_component_set` rather " +
        "than hand-walking the tree."
    : "The Desktop Bridge is NOT connected. Two traps, both confirmed against a real file:\n" +
        "  (a) The remote Figma MCP's page listing CAPS AT 3 PAGES. Never treat that first-3 listing as the " +
        "file's page set. On a real design system it returned only `Colors & Shadow`, `Typography`, `Icons` — " +
        "three FOUNDATION pages and not one component — while a `Screens` page sat unlisted. A scan trusting " +
        "it concludes the system has no components at all. Cover every page via `search_design_system` and " +
        "direct node reads, which are NOT capped, and report any page you could not reach.\n" +
        "  (b) `search_design_system` is NOT scoped to this file by its `fileKey` — that argument is context, " +
        "not a filter. Searching `button` returned 20 component sets from 20 UNRELATED libraries (Bootstrap, " +
        "Radix, Joy UI, several client systems), three of which shared an identical description. Resolving by " +
        "name against that set is not a fallback, it is a coin flip across other people's design systems. " +
        "FIRST identify THIS file's own library key from an initial search result, then pass it in " +
        "`includeLibraryKeys` on every subsequent search. A node resolved from any other library is WRONG, " +
        "however well its name matches — report it as unresolved rather than using it.";
}

/**
 * Build the READ-ONLY audit prompt. Changes nothing in Figma; its job is to produce the facts —
 * above all the resolved node ids.
 *
 * NOT WIRED. Nothing in the app calls this yet, and no build consults its output. `rosterPatchFromAudit`
 * returns the shape a caller WOULD persist; persisting it is a separate, unwritten slice. Until that
 * exists every production build still resolves through the fuzzy path this module was written to
 * retire. Stated here rather than in a commit message because a docstring claiming an integration
 * that does not exist is the same unchecked prose this work is about.
 */
export function buildFigmaHygieneAuditPrompt(input: HygieneAuditInput): string {
  const { fileUrl, roster, bridgeConnected } = input;
  const rosterClause = roster.length
    ? [
        `Account for all ${roster.length} components on the project roster:`,
        roster
          .map((c) => `  - ${c.name}${c.figmaNodeId ? ` (recorded node ${c.figmaNodeId} — VERIFY it still resolves)` : ""}`)
          .join("\n"),
      ].join("\n")
    : "No roster was supplied — enumerate the file's public components and report what you find.";

  return [
    `Audit the Figma file at ${fileUrl} for design-system hygiene. READ ONLY — change nothing in Figma.`,
    "",
    "This runs BEFORE components are built. Its purpose is to find every reason a build would be",
    "inaccurate, and — most importantly — to RESOLVE each component to a stable node id so no later",
    "build has to guess. Report facts you verified, never assumptions.",
    "",
    "This audit is FRAMEWORK-NEUTRAL. Judge the file as a design system, on its own terms — not",
    "against the conventions of any UI framework or programming language. Do NOT recommend renaming",
    "or restructuring anything to suit how the code will eventually be written.",
    "",
    enumerationClause(bridgeConnected),
    "",
    rosterClause,
    "",
    "CHECKS — report each component against all seven, in this order:",
    ...CHECKS,
    "",
    "Report a component as PASS only for checks you actually verified. If a page could not be read or a",
    "node could not be resolved, say so — an unverified check is UNKNOWN, never PASS.",
    "",
    "REPORT THE LIBRARY EACH NODE CAME FROM. `libraryKey` is the key of the library the search",
    "actually returned the node from — not the one you were aiming for. A node resolved from any",
    "other library is WRONG however well its name matches, and reporting the intended key instead of",
    "the observed one would hide exactly the confusion this scoping exists to prevent. Report what",
    "you saw; the caller decides whether it matches.",
    "",
    "When done, output EXACTLY one final line of JSON and nothing after it:",
    '  RESULT: { "components": [ { "name": "button", "nodeId": "1:23", "libraryKey": "lk-…", ' +
      '"pageId": "0:1", "pageName": "button", "variantAxes": ["type","size"], "hasDescription": true, ' +
      '"unboundValues": 0, "issues": ["…"] } ], "blocking": 0, "advisory": 0, "unresolved": ["…"] }',
    "Every one of `blocking`, `advisory` and `unresolved` is REQUIRED. Omitting one must not be",
    "readable as zero — a caller cannot tell a clean file from an incomplete run otherwise.",
    "Use null for a field you could not determine — never invent a node id or a library key.",
  ].join("\n");
}

export interface HygieneRepairInput {
  /** The project's Figma file URL. */
  fileUrl: string;
  /** The audit findings to act on, verbatim from the audit report. */
  findings: string;
  /** When true, describe every edit and stop — write nothing. */
  dryRun: boolean;
}

/**
 * Build the REPAIR prompt — the write side, deliberately narrow.
 *
 * A design file is often a client's, and an agent editing it unattended is not a risk worth
 * taking for a naming fix. So: repairs are limited to metadata (names, descriptions, variant axis
 * labels), the structural changes are proposed rather than performed, and `dryRun` is the
 * expected first call. Nothing here deletes, moves, restyles, or restructures.
 */
export function buildFigmaHygieneRepairPrompt(input: HygieneRepairInput): string {
  const { fileUrl, findings, dryRun } = input;
  return [
    `Repair the design-system hygiene issues found in the Figma file at ${fileUrl}.`,
    "",
    dryRun
      ? "DRY RUN — write NOTHING to Figma. List every edit you WOULD make, one per line, as " +
        "`<node id> | <what changes> | <from> → <to>`, then stop. This list is shown to the user for " +
        "approval before anything is applied."
      : "APPLY the approved edits below. Make ONLY these edits.",
    "",
    "Findings to act on:",
    findings,
    "",
    "IN SCOPE — metadata only, all reversible:",
    "  • Rename a variant AXIS whose name is a Figma placeholder (`Property 1` → `type`), using a name",
    "    drawn from its own values (values primary/secondary/ghost → the axis is `variant`).",
    "  • Rename a component whose name does not match its page, to the page's name.",
    "  • Write a missing component description from what the component actually is",
    "    (`figma_generate_component_doc` when available; otherwise one plain sentence).",
    "",
    "OUT OF SCOPE — propose in the report, never perform:",
    "  • Creating, deleting, moving, or reparenting any node, page, or component.",
    "  • Combining loose components into a component set, or splitting one apart.",
    "  • Binding a raw value to a variable, or creating variables. This changes the design's",
    "    appearance if done wrong and is the designer's call, not ours.",
    "  • Renaming a variant VALUE. Values carry meaning we cannot infer safely.",
    "  • Any change to layout, fills, strokes, effects, or typography.",
    "",
    "Never rename anything toward a code convention — no camelCase-for-JS, no PascalCase-for-React.",
    "The file stays framework-neutral; the generator adapts to it, not the other way round.",
    "",
    "If a proposed edit would be ambiguous (two components could take the same name, an axis has no",
    "coherent name from its values), SKIP it and report it as needing a human decision.",
    "",
    "When done, output EXACTLY one final line of JSON and nothing after it:",
    '  RESULT: { "applied": [ { "nodeId": "1:23", "change": "renamed axis Property 1 → type" } ], ' +
      '"proposed": ["…"], "skipped": [ { "what": "…", "why": "…" } ] }',
  ].join("\n");
}

/** One component's audited state, as returned by the audit run. */
export interface HygieneComponentResult {
  name: string;
  nodeId: string | null;
  /**
   * The library the resolved node ACTUALLY came from, as reported by the search result.
   *
   * Without this a wrong-library node is indistinguishable from a verified in-file one at the
   * structured boundary — the prompt says `includeLibraryKeys`, but nothing downstream could tell
   * whether it was honoured. Null means the run did not report one, which is treated as unverified
   * rather than as a match.
   */
  libraryKey: string | null;
  pageId: string | null;
  pageName: string | null;
  variantAxes: string[];
  hasDescription: boolean;
  unboundValues: number | null;
  issues: string[];
}

export interface HygieneAuditResult {
  components: HygieneComponentResult[];
  blocking: number;
  advisory: number;
  unresolved: string[];
}

/** Coerce one unknown entry into a component result, dropping anything without a usable name. */
function toComponent(raw: unknown): HygieneComponentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name) return null;
  return {
    name: o.name,
    nodeId: typeof o.nodeId === "string" && o.nodeId ? o.nodeId : null,
    libraryKey: typeof o.libraryKey === "string" && o.libraryKey ? o.libraryKey : null,
    pageId: typeof o.pageId === "string" && o.pageId ? o.pageId : null,
    pageName: typeof o.pageName === "string" && o.pageName ? o.pageName : null,
    variantAxes: Array.isArray(o.variantAxes) ? o.variantAxes.filter((v): v is string => typeof v === "string") : [],
    hasDescription: o.hasDescription === true,
    unboundValues: typeof o.unboundValues === "number" ? o.unboundValues : null,
    issues: Array.isArray(o.issues) ? o.issues.filter((v): v is string => typeof v === "string") : [],
  };
}

/**
 * Parse the trailing `RESULT: { … }` line the audit run emits. Null when absent or malformed —
 * the caller treats that as "the audit did not complete", never as "the file is clean".
 */
export function parseHygieneAuditResult(text: string): HygieneAuditResult | null {
  const m = text.match(/RESULT:\s*(\{[\s\S]*\})\s*$/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as Record<string, unknown>;
    if (!Array.isArray(j.components)) return null;
    // Fail CLOSED on the counts. Defaulting a missing or wrong-typed `blocking` to 0 makes an
    // incomplete run indistinguishable from a clean file — the caller reads "0 blockers" and
    // proceeds. Absent evidence is not evidence of absence, so an unparseable result is null.
    if (typeof j.blocking !== "number" || typeof j.advisory !== "number") return null;
    if (!Array.isArray(j.unresolved)) return null;
    return {
      components: j.components.map(toComponent).filter((c): c is HygieneComponentResult => c !== null),
      blocking: j.blocking,
      advisory: j.advisory,
      unresolved: j.unresolved.filter((v): v is string => typeof v === "string"),
    };
  } catch {
    return null;
  }
}

/**
 * The roster patch an audit earns — the ids a caller would record on `.sdd-de/components.json`.
 *
 * REQUIRES the expected library key, and drops any component whose OBSERVED key differs or is
 * absent. Without that gate the cross-library fix stops at the prompt: the instruction says
 * `includeLibraryKeys`, but a node resolved from an unrelated library arrives here looking exactly
 * like a verified in-file one, and gets persisted as though it were. A measured search for `button`
 * returned twenty component sets from twenty libraries, three sharing an identical description, so
 * this is the realistic case rather than a defensive one.
 *
 * With no expected key it returns NOTHING and reports why. That is deliberate: the key cannot be
 * inferred from the audit's own results without circularity, so a caller must supply it. Returning
 * an unfiltered patch instead would be the fail-open shape this whole module exists to remove.
 */
export function rosterPatchFromAudit(
  result: HygieneAuditResult,
  expectedLibraryKey: string | null | undefined,
): {
  patch: Array<{ name: string; figmaNodeId: string; figmaPage?: string; figmaPageId?: string }>;
  /** Components dropped because their library could not be confirmed, with the key observed. */
  rejected: Array<{ name: string; observedLibraryKey: string | null; reason: string }>;
} {
  const resolved = result.components.filter((c) => c.nodeId !== null);
  if (!expectedLibraryKey) {
    return {
      patch: [],
      rejected: resolved.map((c) => ({
        name: c.name,
        observedLibraryKey: c.libraryKey,
        reason: "no expected library key supplied — cannot confirm the node came from this file",
      })),
    };
  }
  const patch: Array<{ name: string; figmaNodeId: string; figmaPage?: string; figmaPageId?: string }> = [];
  const rejected: Array<{ name: string; observedLibraryKey: string | null; reason: string }> = [];
  for (const c of resolved) {
    if (c.libraryKey === null) {
      rejected.push({ name: c.name, observedLibraryKey: null, reason: "run reported no library key" });
      continue;
    }
    if (c.libraryKey !== expectedLibraryKey) {
      rejected.push({ name: c.name, observedLibraryKey: c.libraryKey, reason: "node came from another library" });
      continue;
    }
    patch.push({
      name: c.name,
      figmaNodeId: c.nodeId as string,
      ...(c.pageName ? { figmaPage: c.pageName } : {}),
      ...(c.pageId ? { figmaPageId: c.pageId } : {}),
    });
  }
  return { patch, rejected };
}
