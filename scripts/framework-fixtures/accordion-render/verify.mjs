/**
 * The REAL Accordion, rendered in a real browser.
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
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const FIGMA_BG = "rgb(206, 228, 233)"; // Components/Accordion/Active Item Header Background #CEE4E9
const FIGMA_FG = "rgb(7, 109, 130)"; //  Components/Accordion/Active Item Header Text Color  #076D82

/** The class string this fixture measured, recorded so a drift in the source is visible. */
const REAL_CLASSES = readFileSync(join(HERE, ".real-open-classes.txt"), "utf8").trim();

const results = [];
const record = (id, pass, note) => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${note}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(HERE, "page.html")).href);

const paint = (sel) =>
  page.$eval(sel, (el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, fg: cs.color };
  });

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
record(
  "A3-dark-diverges-again",
  dark.bg !== FIGMA_BG,
  `as-built in dark -> ${dark.bg} (Figma specifies ${FIGMA_BG} for this slot regardless)`,
);

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} asserted cases passed`);
process.exit(passed === results.length ? 0 : 1);
