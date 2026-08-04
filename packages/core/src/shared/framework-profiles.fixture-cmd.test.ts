import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
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

describe("the guard covers every fixture that has a profile command", () => {
  // Without this, adding a framework fixture and forgetting its guard is invisible — the suite
  // would stay green while the new fixture rots exactly as SvelteKit's did.
  it("names every fixture directory carrying a .profile-cmd.txt", () => {
    const named = new Set(CASES.map((c) => c.dir));
    const onDisk = readFileSync(join(FIXTURES, ".guarded-fixtures.txt"), "utf8")
      .split("\n").map((l) => l.trim()).filter(Boolean);
    for (const dir of onDisk) {
      expect(named.has(dir), `${dir} has a .profile-cmd.txt but no case in CASES`).toBe(true);
    }
    expect(onDisk.length).toBe(CASES.length);
  });
});
