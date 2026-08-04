/**
 * Mutation driver for G2b — the class-string tie, in BOTH directions.
 *
 * Honey shipped G2b with a disclosed limit and named it precisely: "M1 and M2 mutate the recorded
 * file, not the source project… I have exercised one direction, and the untested direction is the
 * one that will actually happen." She was right to refuse to edit Roy's live working tree to test
 * her own fixture. Thor then refuted the check from the direction nobody had run — the plausible
 * repair — and it passed.
 *
 * This driver removes the excuse without touching that tree. `extractOpenHeaderClasses` takes
 * CONTENT, so the source side is exercised against an in-memory COPY of the real file. Nothing is
 * written anywhere, and the real `accordion.variants.ts` is opened read-only.
 *
 * Run: node mutate-g2b.mjs        (from this directory)
 * Exit 0 = every mutant caught and the canonical case still passes.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractOpenHeaderClasses, SUBJECT_EXPORT } from "./extract-open-classes.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const SRC = "/Users/royvillasana/Desktop/Roy Villasana/VortSpec/testing project/TokenUpdate";
const VARIANTS = join(SRC, "src/components/accordion/accordion.variants.ts");

if (!existsSync(VARIANTS)) {
  console.error("REFUSING TO RUN: the source project is not on this machine, so the source-side");
  console.error("mutants would prove nothing. This driver reports rather than skipping quietly.");
  process.exit(2);
}

/** Read once. Never written — every mutant is a string transform on this copy. */
const CANONICAL = readFileSync(VARIANTS, "utf8");
const RECORDED = readFileSync(join(HERE, ".real-open-classes.txt"), "utf8").trim();

/** The predicate under test, exactly as `verify.mjs` applies it. */
const g2bPasses = (sourceContent, recorded) => {
  const got = extractOpenHeaderClasses(sourceContent);
  return got.error ? false : got.classes === recorded;
};

const rows = [];
const run = (name, { source = CANONICAL, recorded = RECORDED }, expectPass) => {
  const passed = g2bPasses(source, recorded);
  const ok = passed === expectPass;
  rows.push({ name, passed, expected: expectPass, ok });
  console.log(
    `${ok ? "ok  " : "MISS"}  ${name.padEnd(52)} G2b ${passed ? "PASS" : "FAIL"}  (wanted ${expectPass ? "PASS" : "FAIL"})`,
  );
};

// ── The canonical case. Without it a predicate that always returns false "catches" everything. ──
run("CANONICAL — recorded matches the live source", {}, true);

// ── SOURCE-SIDE: the direction Honey could not run, and the one that actually happens. ──────────
const repaired = CANONICAL.replace(
  "true: 'bg-[var(--color-neutral-100)] text-[var(--color-brand-primary)]'",
  "true: 'bg-[var(--color-accordion-active-bg)] text-[var(--color-accordion-active-fg)]'",
);
run("SOURCE: the Accordion is repaired to component tokens", { source: repaired }, false);

const oneTokenSwapped = CANONICAL.replace("text-[var(--color-brand-primary)]'", "text-[var(--color-brand-secondary)]'");
run("SOURCE: one token swapped in the open state", { source: oneTokenSwapped }, false);

// ── THOR'S MUTANT, the one the whole-file substring search let through. ─────────────────────────
run(
  "RECORDED: set to the isOpen:false value (Thor's repair)",
  { recorded: "bg-[var(--color-surface)] text-[var(--color-text-default)]" },
  false,
);

// ── POSITION: the file has three `isOpen:{true:…}`. Pick the wrong one and the fixture measures
//    a component it is not rendering. ────────────────────────────────────────────────────────────
run("RECORDED: the BODY variant's open value ('block')", { recorded: "block" }, false);
run("RECORDED: the CHEVRON variant's open value ('rotate-180')", { recorded: "rotate-180" }, false);

// ── ANCHOR: renaming the subject export must FAIL loudly, not skip and not pass. ────────────────
const renamed = CANONICAL.replace(`export const ${SUBJECT_EXPORT} = cva(`, "export const accordionTriggerVariants = cva(");
run("SOURCE: subject export renamed — anchor lost", { source: renamed }, false);

// ── The discriminating control for the ANCHOR itself: editing a DIFFERENT export must NOT move
//    this verdict. A scope that leaked would report drift that is not in the subject. ────────────
const bodyChanged = CANONICAL.replace("true: 'block',", "true: 'flex',");
run("SOURCE: a different export changes — must still PASS", { source: bodyChanged }, true);

const missed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - missed.length}/${rows.length} as expected`);
if (missed.length) {
  console.error(`SURVIVORS: ${missed.map((r) => r.name).join("; ")}`);
  process.exit(1);
}
process.exit(0);
