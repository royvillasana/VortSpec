/**
 * Extract the ONE class string this fixture measures: `accordionHeaderVariants`' open-state value.
 *
 * WHY THIS IS A FUNCTION OVER CONTENT AND NOT A LINE INSIDE `verify.mjs`.
 *
 * G2b's first version asked whether the recorded string appeared ANYWHERE in
 * `accordion.variants.ts`. Thor refuted it with a mutant nobody had tried — the plausible REPAIR:
 * set the recorded string to `bg-[var(--color-surface)] text-[var(--color-text-default)]`, the
 * value the header would carry once fixed, and G2b still passed. Not because the fixture was
 * right, but because that exact text also occurs in the `isOpen:false` branch further down. A
 * whole-file substring search cannot tell "this IS the open-state value" from "this appears
 * somewhere in a file that reuses token combinations across variants".
 *
 * Anchoring to `isOpen: { true: … }` alone is NOT enough either, and this is the part Thor's
 * suggested fix does not say out loud: the file has THREE `isOpen` blocks —
 * `accordionHeaderVariants` (the subject), `accordionBodyVariants` (`'block'`) and
 * `chevronIconVariants` (`'rotate-180'`). An anchor on the first `isOpen:{true:` it finds is a
 * coin flip against source order. So the scope is the named export first, then `isOpen.true`
 * inside it.
 *
 * Separated from `verify.mjs` for one reason: Honey disclosed that G2b's mutants moved the
 * RECORDED file and never the SOURCE, and that "the untested direction is the one that will
 * actually happen" — the Accordion gets repaired. The source is Roy's live working tree and must
 * not be edited to test a fixture. A function over CONTENT can be run against a mutated COPY, so
 * that direction is now exercised instead of assumed symmetric. See `mutate-g2b.mjs`.
 */

/** The export whose open-state classes this fixture renders. Scope before anchor. */
export const SUBJECT_EXPORT = "accordionHeaderVariants";

/**
 * @param {string} source contents of `accordion.variants.ts`
 * @returns {{ classes: string } | { error: string }} the open-state class string, or why not.
 *
 * Never returns null-ish on failure: a lost anchor is a FAILURE to report, not an absence to skip
 * over. The fixture can only skip when the source is not on this machine at all.
 */
export function extractOpenHeaderClasses(source) {
  const declIdx = source.indexOf(`export const ${SUBJECT_EXPORT} = cva(`);
  if (declIdx === -1) {
    return { error: `no \`export const ${SUBJECT_EXPORT} = cva(\` in the source — the component was renamed or restructured, so this fixture no longer knows what it is measuring` };
  }

  // Scope to this cva call: from the declaration to the start of the next top-level export.
  const rest = source.slice(declIdx + 1);
  const nextExport = rest.indexOf("\nexport ");
  const block = nextExport === -1 ? rest : rest.slice(0, nextExport);

  // `isOpen: { true: '<classes>'` inside THAT block only. Quote style is whatever the file uses.
  const m = block.match(/isOpen\s*:\s*\{\s*true\s*:\s*(['"`])([\s\S]*?)\1/);
  if (!m) {
    return { error: `\`${SUBJECT_EXPORT}\` has no \`isOpen: { true: … }\` value — the open state is expressed some other way now` };
  }
  return { classes: m[2] };
}
