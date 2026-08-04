import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { profileFor } from "./framework-profiles";

/**
 * Every framework fixture's command must still be the profile's command.
 *
 * The SvelteKit fixture hardcoded `npx svelte-check --threshold error` with the comment "verbatim
 * from framework-profiles.ts". #81 then prepended `svelte-kit sync` — the fix that fixture's own
 * evidence motivated — and the literal silently became false while still telling readers it was a
 * copy. Nothing caught it, because the fixtures only run by hand.
 *
 * These run in the normal suite. They do not run the fixtures — those need per-framework
 * toolchains — but they check the thing most likely to rot without anyone noticing, on every push.
 *
 * TWO STRENGTHS, and the difference is stated rather than blurred:
 *  - sveltekit READS `.profile-cmd.txt` at runtime, so the file is load-bearing.
 *  - vue and astro assemble their commands inline for `spawnSync`, so the file is checked against
 *    the profile AND the fixture source is checked for the command's distinguishing tokens. That
 *    is weaker — it proves the fixture mentions the right tool, not that it invokes exactly this
 *    string — and it is why `readsFileAtRuntime` is recorded per fixture instead of implied.
 */
const FIXTURES = join(new URL(".", import.meta.url).pathname, "../../../../scripts/framework-fixtures");

interface FixtureCmd {
  dir: string;
  framework: string;
  /** True when verify.mjs reads `.profile-cmd.txt`; false when the command is assembled inline. */
  readsFileAtRuntime: boolean;
  /** Distinguishing substrings that must appear in the fixture source when it does not read the file. */
  sourceTokens: string[];
  /**
   * What the command MUST contain to still be this framework's check.
   *
   * Equality alone is not enough: a mutant that regressed astro's profile to `npx tsc --noEmit`
   * and updated the recorded file to match passed all seven assertions. The guard could not tell
   * "matches the profile" from "is still correct" — a matcher that cannot fire, in the guard built
   * against exactly that. These are the semantic half.
   */
  mustContain: string[];
}

const CASES: FixtureCmd[] = [
  // sveltekit MUST still self-prepare — that is #81's whole finding.
  { dir: "sveltekit", framework: "sveltekit", readsFileAtRuntime: true, sourceTokens: [],
    mustContain: ["svelte-kit sync", "svelte-check"] },
  // vue MUST use vue-tsc: plain tsc cannot parse `.vue` at all.
  { dir: "vue", framework: "vue", readsFileAtRuntime: false, sourceTokens: ["vue-tsc", "--noEmit"],
    mustContain: ["vue-tsc"] },
  // astro MUST use astro check: it self-prepares `.astro/`, and tsc cannot parse `.astro`.
  { dir: "astro", framework: "astro", readsFileAtRuntime: false, sourceTokens: ["astro", "check"],
    mustContain: ["astro check"] },
];

describe.each(CASES)("$dir fixture command", (c) => {
  const cmdFile = join(FIXTURES, c.dir, ".profile-cmd.txt");
  const verify = join(FIXTURES, c.dir, "verify.mjs");

  it("records the profile's typecheckCmd exactly", () => {
    // Fail loudly rather than skip: a missing file means the fixture moved and this guard stopped
    // guarding, which is the silent-rot case it exists to prevent.
    expect(existsSync(cmdFile), `${cmdFile} missing — did the fixture move?`).toBe(true);
    expect(readFileSync(cmdFile, "utf8").trim()).toBe(profileFor(c.framework)!.typecheckCmd);
  });

  it("the command is still this framework's check, not merely self-consistent", () => {
    // The semantic half. Without it, regressing the profile and updating the file to match is
    // invisible — which is exactly what the M2 mutant demonstrated before this existed.
    const recorded = readFileSync(cmdFile, "utf8").trim();
    for (const token of c.mustContain) {
      expect(recorded, `${c.dir} lost ${token}`).toContain(token);
    }
  });

  it("the fixture is tied to that command", () => {
    const src = readFileSync(verify, "utf8");
    if (c.readsFileAtRuntime) {
      // Strongest form: the fixture cannot use a different command than the one recorded.
      expect(src).toContain(".profile-cmd.txt");
    } else {
      // Weaker form, and labelled as such: the command is assembled inline, so this proves the
      // fixture invokes the right tool rather than the exact string.
      for (const token of c.sourceTokens) expect(src, `${c.dir} lost ${token}`).toContain(token);
    }
  });
});

/**
 * Fixtures that carry a `verify.mjs` but deliberately no `.profile-cmd.txt`, each with its reason.
 * A fixture belongs here ONLY if it runs no framework typecheck at all — a render harness, say.
 * "I haven't got to it yet" is not a reason; that is the rot this file exists to make loud.
 */
const NO_PROFILE_CMD: { dir: string; because: string }[] = [
  {
    dir: "accordion-render",
    because:
      "render harness: it compiles Tailwind and asserts computed colors in a browser, and runs no " +
      "framework typecheck, so there is no profile command for it to drift from. Verified by " +
      "reading its verify.mjs — no tsc, no svelte-check, no astro check, no profileFor.",
  },
  {
    dir: "browser",
    because:
      "browser render harness: it serves the compiled CSS to a real browser via web-test-runner " +
      "and asserts getComputedStyle, and runs no framework typecheck, so there is no profile " +
      "command for it to drift from. Same carve-out as accordion-render, and its verify.mjs is " +
      "checked below for the same typecheck binaries.",
  },
];

describe("the guard covers every fixture", () => {
  /**
   * The completeness case USED to read `.guarded-fixtures.txt` — a hand-maintained file claiming
   * to list the guarded fixtures. Fizz got a mutant past it: a new `nuxt/.profile-cmd.txt` with no
   * CASES entry and no line in that file passed all ten assertions. `expect(onDisk.length).toBe(
   * CASES.length)` compared two hand-maintained lists to each other, so both could be wrong
   * together — the same shape as the astro survivor above, and the same shape as the SvelteKit
   * literal that claimed to be "verbatim from framework-profiles.ts" and silently stopped being
   * true. A completeness check that trusts a transcription of the disk is not a completeness check.
   *
   * The disk is now the only source of truth. `.guarded-fixtures.txt` is deleted rather than left
   * lying around as a stale list nothing reads.
   *
   * A directory is a fixture if it has EITHER file. Keying on `.profile-cmd.txt` alone catches
   * Fizz's mutant but not a fixture that hardcodes its command and never opts in; keying on
   * `verify.mjs` alone catches that one but not his. The union catches both.
   */
  const fixtureDirs = () =>
    readdirSync(FIXTURES, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter(
        (d) =>
          existsSync(join(FIXTURES, d, "verify.mjs")) ||
          existsSync(join(FIXTURES, d, ".profile-cmd.txt")),
      );

  it("every fixture on disk is either guarded or explicitly exempt", () => {
    const guarded = new Set(CASES.map((c) => c.dir));
    const exempt = new Set(NO_PROFILE_CMD.map((e) => e.dir));
    for (const dir of fixtureDirs()) {
      expect(
        guarded.has(dir) || exempt.has(dir),
        `${dir} is a fixture with no case in CASES and no NO_PROFILE_CMD entry`,
      ).toBe(true);
    }
  });

  it("an exemption is a claim about the fixture, and the claim is checked", () => {
    // Not just the SHAPE of the exemption — its SUBSTANCE. An exemption says "this fixture runs no
    // framework typecheck, so it has no profile command to drift from". Left as prose, that is the
    // same unchecked-sentence class this whole file exists to kill: accordion-render could grow an
    // `astro check` tomorrow and its exemption would quietly become a lie.
    //
    // Match on the BINARY, not the full command phrase. My first version forbade `mustContain`
    // verbatim ("astro check", "svelte-kit sync") and could not fire: every fixture invokes
    // `spawnSync('npx', [bin, ...args])`, so those phrases never appear as contiguous substrings in
    // any of them. A matcher that cannot fire, in the guard against matchers that cannot fire —
    // caught only because the mutant I wrote happened to use the realistic array form and survived.
    //
    // Measured before trusting it: tsc/vue-tsc/svelte-check/svelte-kit/astro appear 6-30 times
    // across the three guarded fixtures and ZERO times in accordion-render, so this discriminates
    // rather than merely running. Derived from CASES (first word of each token) plus the base
    // compiler, so a newly guarded framework extends it without another hardcoded list.
    const typecheckTokens = [
      ...new Set(["tsc", ...CASES.flatMap((c) => c.mustContain).map((t) => t.split(" ")[0])]),
    ];
    for (const e of NO_PROFILE_CMD) {
      expect(
        existsSync(join(FIXTURES, e.dir, ".profile-cmd.txt")),
        `${e.dir} is listed exempt but HAS a .profile-cmd.txt — guard it instead`,
      ).toBe(false);
      expect(e.because.trim().length, `${e.dir}'s exemption states no reason`).toBeGreaterThan(0);

      const src = readFileSync(join(FIXTURES, e.dir, "verify.mjs"), "utf8");
      for (const token of typecheckTokens) {
        expect(
          src,
          `${e.dir} is exempt as running no framework typecheck, but its verify.mjs runs "${token}"`,
        ).not.toContain(token);
      }
    }
  });

  it("no exemption outlives the fixture it names", () => {
    // Scoped to exemptions on purpose. A stale CASES entry is already caught by the per-case
    // existsSync above, so asserting it here would be redundant coverage claimed as new.
    const onDisk = new Set(fixtureDirs());
    for (const e of NO_PROFILE_CMD) {
      expect(onDisk.has(e.dir), `${e.dir} is exempted here but no such fixture exists`).toBe(true);
    }
  });
});
