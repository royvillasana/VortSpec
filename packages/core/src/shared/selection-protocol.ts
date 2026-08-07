/**
 * The component SELECTION METHOD carried into compose and light-page runs — OpenSpec change:
 * agentic-design-system, task 3.3.
 *
 * This is the `ai-ds-composer` skill's algorithm — parse intent → consult metadata → apply selection
 * criteria → check anti-patterns → compose → flag gaps — expressed in VortSpec's own vocabulary.
 *
 * **Why translated rather than referenced.** The vendored skill is written against a different
 * layout: colocated `*.metadata.ts` files, a top-level `design-system.metadata.ts`, and a plural
 * `category`. A VortSpec project has none of those — its metadata is JSON under `.vortspec/metadata/`
 * with a singular `identity.category`, and its relationships live in `.vortspec/ai/`. Telling a run
 * to "follow ai-ds-composer" as written would send it looking for files that do not exist, which is
 * the same failure the generated rule documents exist to avoid. What transfers is the ALGORITHM; the
 * paths are ours. (`/storybook` already documents the same bridge for `ai-component-metadata`.)
 *
 * Kept short deliberately. This rides on every compose run, and a selection method that costs more
 * than the composition it guides is not worth carrying.
 */

/** How the run may resolve a requirement no component covers. */
export type GapPolicy =
  /** Framework runs: stop and report, because hand-written markup here becomes a shadow component. */
  | "report"
  /** Light-first runs: build it framework-free and NAME it, because the light page is the deliverable. */
  | "build-and-name";

/**
 * The selection method as prompt lines.
 *
 * The gap rule is the one step that genuinely differs between the two paths, and it must not
 * contradict what the surrounding prompt already says. A framework compose run returns a
 * `noMatch` result rather than hand-writing markup; a light-first run is explicitly told to keep
 * going and build the missing piece. Emitting one rule for both would have this block fighting the
 * prompt it was inserted into.
 */
export function selectionProtocol(gapPolicy: GapPolicy): string {
  return [
    "How to choose components (follow this, do not improvise):",
    "1. Turn the request into a concrete requirement before looking at the roster — what action, what content, what prominence.",
    "2. Select on `aiHints.selectionCriteria` and the description, NEVER on the name. A name says what a component is called, not when it is the right one.",
    "3. Pick a variant by its `purpose`. The enum values are in the source already; why to pick one is the only thing the metadata adds.",
    "4. Check `usage.antiPatterns` BEFORE writing. When one matches what you are about to do, follow its `alternative` instead — an anti-pattern is a rule, not a caution.",
    "5. Prefer native HTML and token-grounded CSS for pure layout and spacing. Reach for a component when it carries behavior, state or accessibility you would otherwise reimplement.",
    gapPolicy === "report"
      ? "6. If nothing fits, say so and stop — do not hand-write a substitute. Markup that duplicates a component the design system should own is a shadow implementation, and it is harder to find later than a missing piece."
      : "6. If nothing fits, build it framework-free from the tokens AND name it in your result as a gap, so it can be harvested as a real component later. Do not stop.",
    "7. Say which criterion drove each choice, in one clause. \"Primary, because selectionCriteria says main action\" is reviewable; \"it looks right\" is not.",
  ].join("\n");
}
