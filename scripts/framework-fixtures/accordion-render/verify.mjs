/**
 * The real Accordion's CLASS STRING and TOKENS, compiled by the real toolchain, rendered.
 *
 * Thor was right that "the real Accordion, rendered" overstated this. What runs is a hand-written
 * `<button>` carrying the class string extracted from the component, styled by CSS that the source
 * project's own tailwindcss CLI compiled from its own config and tokens. That is strictly less than
 * mounting the React component, and strictly more than a reconstruction. The title now says which.
 *
 * #82 proved the *mechanism* on synthetic CSS: a valid `var()` bound to the wrong variable renders
 * a different colour. It deliberately did not claim the specific component renders wrong. This does
 * — and every input is taken from the project rather than retyped:
 *
 *   class string  extracted from TokenUpdate/src/components/accordion/accordion.variants.ts
 *   tokens.css    copied from TokenUpdate/src/styles/tokens.css
 *   tailwind cfg  copied from TokenUpdate/tailwind.config.cjs, compiled by TokenUpdate's own CLI
 *
 * So the CSS under measurement is what that project's build actually produces, not a reconstruction.
 * `getComputedStyle` then resolves the cascade the way a screen does.
 *
 * Built around A2 — "the two render differently" — because Fizz's mutants showed the equality case
 * catches one mutant while the difference case catches all three. A0 still earns a place as the only
 * assertion that must come back EQUAL; without it an always-mismatch harness passes everything.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { extractOpenHeaderClasses, SUBJECT_EXPORT } from "./extract-open-classes.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const FIGMA_BG = "rgb(206, 228, 233)"; // Components/Accordion/Active Item Header Background #CEE4E9
const FIGMA_FG = "rgb(7, 109, 130)"; //  Components/Accordion/Active Item Header Text Color  #076D82

/**
 * The class string this fixture measured, recorded and TIED to its source by G2b below.
 *
 * This comment used to end "recorded so a drift in the source is visible" — and nothing made it
 * visible. G2 tied `tokens.css` and `tailwind.config.cjs` to the source project from a
 * hand-maintained pair list, and the class string, which is the fixture's actual SUBJECT, was not
 * in that list. Fizz predicted exactly this when he asked whether G2's what-to-hash was
 * hand-maintained; it was, and this was what it missed.
 *
 * It matters more than the other two ties. Every finding this fixture publishes is a claim about
 * what THIS STRING paints. If the Accordion is fixed — which is the entire point of the finding —
 * the fixture keeps rendering the old string and keeps reporting the old result. It would report a
 * defect as still present after it had been repaired, which is worse than not measuring it.
 */
const REAL_CLASSES = readFileSync(join(HERE, ".real-open-classes.txt"), "utf8").trim();

const results = [];
const record = (id, pass, note) => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${note}`);
};

// ── G0/G1 — refuse to run rather than pass vacuously. ────────────────────────────────────────
// Thor's finding: `built.css` is generated and gitignored, so skipping the manual build left
// `#as-built` unstyled and A2/A2b/A3 all still passed, having proven nothing. A harness that
// reports success without its subject present is the exact defect this thread exists to remove,
// and it was in mine.
const CSS = join(HERE, "built.css");
if (!existsSync(CSS) || readFileSync(CSS, "utf8").length < 500) {
  console.error("REFUSING TO RUN: built.css missing or empty. Compile it first — see README.");
  process.exit(2);
}

// G2 — the committed copies must still match the project they were taken from. They are copies;
// this is what stops them silently becoming stale copies. Absent source is reported, never passed.
const SRC = "/Users/royvillasana/Desktop/Roy Villasana/VortSpec/testing project/TokenUpdate";
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 12);
for (const [mine, theirs] of [["tokens.css", "src/styles/tokens.css"], ["tailwind.config.cjs", "tailwind.config.cjs"]]) {
  const src = join(SRC, theirs);
  if (!existsSync(src)) {
    console.log(`SKIPPED  source-tie ${mine}  (source project not present here — cannot verify)`);
    continue;
  }
  const same = sha(join(HERE, mine)) === sha(src);
  record(`G2-source-tie-${mine}`, same, `${sha(join(HERE, mine))} vs ${sha(src)}`);
}

// G2b — the class string, tied to the component it was transcribed from. Not a file hash: the
// fixture records one variant's classes, not the whole variants file, so byte-identity is the
// wrong instrument.
//
// It is not a whole-file substring search either, and that is Thor's finding rather than a
// preference. `.includes()` over the file body passed on the plausible REPAIR — set the recorded
// string to `bg-[var(--color-surface)] text-[var(--color-text-default)]` and it still matched,
// because that text also lives in the `isOpen:false` branch. A check that matches the wrong
// POSITION and calls it verbatim is the same class of defect one level down.
//
// So: extract the open-state value of `accordionHeaderVariants` specifically, and compare by
// EQUALITY. Three exports in that file have an `isOpen:{true:…}`; the scope is the named export,
// not the first anchor that matches. See extract-open-classes.mjs, and mutate-g2b.mjs for the
// source-side direction Honey correctly flagged as unexercised.
const VARIANTS = join(SRC, "src/components/accordion/accordion.variants.ts");
if (!existsSync(VARIANTS)) {
  console.log("SKIPPED  source-tie class-string  (source project not present here — cannot verify)");
} else {
  const got = extractOpenHeaderClasses(readFileSync(VARIANTS, "utf8"));
  if (got.error) {
    // A lost anchor is a FAILURE, not a skip. The source is present; the fixture just cannot tell
    // what it is measuring any more, which is exactly when it must stop claiming.
    record("G2b-source-tie-class-string", false, `ANCHOR LOST: ${got.error}`);
  } else {
    const same = got.classes === REAL_CLASSES;
    record(
      "G2b-source-tie-class-string",
      same,
      same ? `${SUBJECT_EXPORT}.isOpen.true matches verbatim` : `DRIFTED\n    recorded: ${REAL_CLASSES}\n    source:   ${got.classes}`,
    );
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(HERE, "page.html")).href);

const paint = (sel) =>
  page.$eval(sel, (el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, fg: cs.color };
  });

// G1 — the arbitrary class must actually resolve. Unstyled would be rgba(0, 0, 0, 0).
const canary = await paint("#canary");
record(
  "G1-stylesheet-applied",
  canary.bg !== "rgba(0, 0, 0, 0)",
  `canary bg ${canary.bg} (default would mean the stylesheet never loaded)`,
);

const built = await paint("#as-built");
const designed = await paint("#as-designed");
const dark = await paint("#as-built-dark");

console.log(`\nclasses under test: ${REAL_CLASSES}\n`);

// A0 — the false polarity. The as-designed element MUST match Figma, or nothing below means
// anything: an always-mismatch harness would pass every other case.
record(
  "A0-designed-matches-figma",
  designed.bg === FIGMA_BG && designed.fg === FIGMA_FG,
  `as-designed -> bg ${designed.bg}, fg ${designed.fg} (expected ${FIGMA_BG} / ${FIGMA_FG})`,
);

// A1 — what the shipped component actually paints. Recorded, not asserted against a guess.
console.log(`OBSERVED  A1-as-built  bg ${built.bg}, fg ${built.fg}`);

// A2 — LOAD-BEARING. Both are syntactically valid `var()` bindings; only rendering separates them.
record(
  "A2-render-differently",
  built.bg !== designed.bg,
  `as-built ${built.bg} vs as-designed ${designed.bg}`,
);

// A2b — the text colour, measured separately: the two wrong bindings are independent defects and
// one of them could be right by coincidence.
record(
  "A2b-text-differs",
  built.fg !== designed.fg,
  `as-built ${built.fg} vs as-designed ${designed.fg}`,
);

// A3 — the wrong token tracks a DIFFERENT scale. `--color-neutral-100` is overridden in the dark
// theme, so the substitution does not merely paint one wrong colour: it follows a palette ramp the
// component was never meant to follow, and diverges further wherever that ramp differs.
// A3 — the mechanism, not merely "the colour changed". Thor's point: `dark.bg !== FIGMA_BG` is a
// difference, and "tracks the wrong scale" is a stronger claim that needs its own evidence. Bind
// the substituted token DIRECTLY per theme and require as-built to equal it in both. That is what
// "follows the neutral ramp" means, stated as an assertion.
const probeLight = await paint("#probe-neutral-light");
const probeDark = await paint("#probe-neutral-dark");
record(
  "A3-follows-the-neutral-ramp",
  built.bg === probeLight.bg && dark.bg === probeDark.bg && probeLight.bg !== probeDark.bg,
  `as-built light ${built.bg} == neutral-100 light ${probeLight.bg}; ` +
    `as-built dark ${dark.bg} == neutral-100 dark ${probeDark.bg}; ramp differs ${probeLight.bg !== probeDark.bg}`,
);

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} asserted cases passed`);
process.exit(passed === results.length ? 0 : 1);
