/**
 * A lint over PROSE: a claim we have refuted may appear only where it is labelled `WRONG`.
 *
 * Every other assertion in this package reads a VALUE — `idioms.variants`, a built doc, a prompt.
 * That protects what ships and leaves comments and JSDoc to human review, which is exactly where
 * Thor's catches on 2026-08-04 landed: a stale JSDoc here, a stale block comment in Bumble's
 * fixture, both in one round. A comment is not emitted, but it is text on disk, so it is readable —
 * just not by the kind of assertion any of us were writing.
 *
 * Used by `framework-prose.test.ts` over this package's sources, and runnable directly over any
 * path (Node 24 strips the types natively, so there is no build step and no second copy of the
 * parser to drift):
 *
 *     node packages/core/src/shared/refuted-prose.ts <file|dir> [...]
 *
 * It does NOT discover new false claims — it can only hold the line on ones already refuted and
 * listed in `REFUTED`. A wrong statement nobody has caught yet passes silently.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The mechanisms this repo asserted and got wrong, with the evidence that refuted each.
 *
 * Svelte, refuted by RESEARCH/VORTSPEC_SVELTE_FIXTURE_2026-08-04.md (v1) and
 * RESEARCH/VORTSPEC_SVELTE_CSS_SCOPE_CONTROL_2026-08-04.md (v2), pinned by the `P4-scope-*` cases.
 * Angular, refuted by RESEARCH/VORTSPEC_ANGULAR_FIXTURE_2026-08-04.md, cases `A4-*` / `A6-out-*`.
 */
export const REFUTED: readonly { id: string; re: RegExp }[] = [
  // Svelte v1 — helper-built classes are stripped and the component ships unstyled.
  { id: "svelte-v1-stripped", re: /(?<!nothing )(?<!not )(?:is|are) stripped/i },
  { id: "svelte-v1-unstyled", re: /ships? unstyled/i },
  // Svelte v2 — a dynamic class makes every selector unprovable and turns the analysis off.
  { id: "svelte-v2-every-selector", re: /every selector/i },
  { id: "svelte-v2-analysis-off", re: /analysis (?:is )?off/i },
  { id: "svelte-v2-pruning-disabled", re: /disabl\w*\s+(?:the\s+)?prun|prun\w*\s+is\s+disabled/i },
  // Angular — the build was said to cover the template as well as the class.
  { id: "angular-build-covers-both", re: /(?:build|it)\s+covers\s+both/i },
];

export type Occurrence = { file: string; line: number; claim: string; text: string };

/** How a line's readable content is extracted, which is the only thing that varies by file type. */
type Mode = "code" | "prose";

const modeFor = (path: string): Mode => (extname(path) === ".md" ? "prose" : "code");

/**
 * A line's content with its markers removed, or null when the line carries no prose.
 *
 * In code that means comment markers, so a statement is never mistaken for commentary. In
 * markdown every line is prose, so only list/quote markers come off — and a fence is treated as
 * carrying nothing, which CLOSES any open label. That is deliberate: a fenced block is usually
 * captured tool output, and letting a label reach across it would exempt more than it should.
 */
export function lineContent(line: string, mode: Mode): string | null {
  if (mode === "prose") {
    if (/^\s*(?:```|~~~)/.test(line)) return null;
    // List/quote/heading markers, then emphasis — a label is routinely written `**WRONG v2:**`,
    // and leaving the asterisks on would stop it being recognised as a label at all.
    return line
      .replace(/^\s*(?:[>*+-]\s+|\d+\.\s+|#{1,6}\s+)*/, "")
      .replace(/^(?:\*\*|__|\*|_)+/, "")
      .trim();
  }
  const m = /^\s*(?:\/\/+|\/\*+|\*+)(.*)$/.exec(line);
  if (!m) return null;
  return m[1].replace(/\*+\/\s*$/, "").trim();
}

/**
 * Opens a labelled region: the content must BEGIN with an explicit `WRONG …:` label.
 *
 * Thor's first false negative was that any line merely CONTAINING the word opened the exemption,
 * so `const WRONG = false;` above a comment hid the claim in it. A label is a syntax, not a
 * substring — anything else fails closed and is reported.
 */
export const OPENS_LABEL = /^WRONG\b[^:]*:/;

/**
 * Occurrences of a refuted claim that are NOT inside an explicit `WRONG` label.
 *
 * The label covers its own paragraph and no more: it closes at `ACTUAL`, at a blank line, at `*​/`,
 * and at the first line carrying no prose. `*​/` closes AFTER the line is judged, so a one-line
 * block comment is itself exempt while the next line is not.
 *
 * ONE predicate, asserted in both polarities by the tests. Bumble's mutant showed an always-true
 * detector surviving a 10-case matrix where every case expected the same answer.
 */
export function unlabelledRefutedClaims(source: string, file: string): Occurrence[] {
  const mode = modeFor(file);
  const found: Occurrence[] = [];
  let labelled = false;
  source.split("\n").forEach((text, i) => {
    const content = lineContent(text, mode);
    if (content !== null && OPENS_LABEL.test(content)) labelled = true;
    else if (content === null || content === "" || /\bACTUAL\b/.test(content)) labelled = false;

    if (!labelled) {
      for (const { id, re } of REFUTED) {
        if (re.test(text)) found.push({ file, line: i + 1, claim: id, text: text.trim() });
      }
    }
    // A block comment ends here, so the label cannot reach whatever follows.
    if (mode === "code" && text.includes("*/")) labelled = false;
  });
  return found;
}

const SCANNABLE = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".svelte", ".vue", ".md"]);

/** Every scannable file under a path, or the path itself when it is a file. */
export function filesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const child = join(path, e.name);
    return e.isDirectory() ? filesUnder(child) : SCANNABLE.has(extname(e.name)) ? [child] : [];
  });
}

export function scan(paths: string[]): Occurrence[] {
  return paths.flatMap((p) =>
    filesUnder(p).flatMap((f) => unlabelledRefutedClaims(readFileSync(f, "utf8"), f)),
  );
}

// Runnable directly; under vitest `argv[1]` is the runner, so this stays inert when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("usage: node refuted-prose.ts <file|dir> [...]");
    process.exit(2);
  }
  const found = scan(paths);
  for (const o of found) console.log(`${o.file}:${o.line}  [${o.claim}]  ${o.text}`);
  console.log(
    found.length === 0
      ? `clean — no unlabelled refuted claim in ${paths.join(", ")}`
      : `${found.length} unlabelled refuted claim(s). Label each as "WRONG …:" or delete it.`,
  );
  process.exit(found.length === 0 ? 0 : 1);
}
