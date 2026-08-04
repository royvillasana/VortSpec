import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { profileFor } from "./framework-profiles";

/**
 * The SvelteKit fixture's command must not drift from the profile it claims to test.
 *
 * It used to hardcode `npx svelte-check --threshold error` with the comment "verbatim from
 * framework-profiles.ts". #81 then prepended `svelte-kit sync` — the fix that fixture's own
 * evidence motivated — and the literal silently became false while still telling readers it was a
 * copy. Nothing caught it because the fixture only runs by hand.
 *
 * This runs in the normal suite, so the next profile change fails HERE rather than rotting there.
 * It is the cheapest available answer to "nothing runs in CI" for this particular claim: the
 * fixture still needs a SvelteKit toolchain and a person, but the thing most likely to go stale
 * without anyone noticing is now checked on every push.
 */
const CMD_FILE = join(
  new URL(".", import.meta.url).pathname,
  "../../../../scripts/framework-fixtures/sveltekit/.profile-cmd.txt",
);

describe("sveltekit fixture command", () => {
  it("matches the profile's typecheckCmd exactly", () => {
    // Fail loudly rather than skipping: a missing file means the fixture moved and this guard
    // stopped guarding, which is precisely the silent-rot case it exists to prevent.
    expect(existsSync(CMD_FILE), `${CMD_FILE} is missing — did the fixture move?`).toBe(true);
    const recorded = readFileSync(CMD_FILE, "utf8").trim();
    expect(recorded).toBe(profileFor("sveltekit")!.typecheckCmd);
  });

  it("the recorded command is the one that self-prepares", () => {
    // Both halves asserted, so a future edit that drops the sync half fails here even if someone
    // updates the file to match a regressed profile.
    const recorded = readFileSync(CMD_FILE, "utf8").trim();
    expect(recorded).toContain("svelte-kit sync");
    expect(recorded).toContain("svelte-check");
  });
});
