/**
 * SvelteKit profile fixture — compiled, not reasoned.
 *
 * The claim under test: sveltekit's `typecheckCmd` is BYTE-IDENTICAL to svelte's
 * (`npx svelte-check --threshold error`). Fizz flagged "likely inherits Svelte's result" as the
 * exact reasoning the Svelte round already refuted once, and Nuxt turned out to need
 * `nuxi typecheck` rather than bare `vue-tsc` because it GENERATES types. SvelteKit generates
 * `./$types` into `.svelte-kit/types/` via `svelte-kit sync`. So the question is not whether
 * svelte-check reads `.svelte` — it does — but whether the profile's command is SUFFICIENT on a
 * project that uses the generated surface.
 *
 * Discipline carried from Bumble's Vue round:
 *  - every declared failure requires its SPECIFIC diagnostic, not a non-zero exit
 *  - ANSI escapes removed inside the predicate, not by weakening the pattern
 *  - one case that requires the measurement to come back FALSE (SK0)
 *  - observed exit codes PRINTED, never assumed (svelte-check does not exit 1)
 *  - a real `.ts` in the project so plain `tsc` cannot exit TS18003 and be read as evidence
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const HERE = new URL(".", import.meta.url).pathname;
import { writeFileSync, renameSync, copyFileSync, existsSync, rmSync } from "node:fs";

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const stripAnsi = (s) => String(s).replace(ANSI, "");

function run(cmd) {
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out: stripAnsi(out) };
  } catch (e) {
    return { status: e.status ?? -1, out: stripAnsi(`${e.stdout ?? ""}${e.stderr ?? ""}`) };
  }
}
const clean = (r) => r.status === 0;
/**
 * Requires the SPECIFIC diagnostic. A non-zero exit alone is not evidence of the declared error.
 *
 * NOTE, and it matters beyond this fixture: `svelte-check` emits NO numeric TS codes. A type
 * error prints as `Error: Type 'number' is not assignable to type 'string'. (ts)` — message text
 * plus a `(ts)` marker. So the `failedWith(run, "TS2322")` shape the Vue/Angular fixtures use
 * cannot work here; asserting a code would silently degrade to "exited non-zero", which is the
 * exact V10 defect. The predicate owns the tool's real output instead of the pattern being
 * weakened to fit it.
 */
const failedWith = (r, pattern) => r.status !== 0 && pattern.test(r.out) && /\(ts\)/.test(r.out);
const TYPE_MISMATCH = /Type 'number' is not assignable to type 'string'/;

/**
 * The profile's command, READ rather than transcribed.
 *
 * This line used to be a string literal with the comment "verbatim from framework-profiles.ts".
 * #81 then changed the profile to prepend `svelte-kit sync` — the fix this fixture's own evidence
 * motivated — and the literal silently became false, in merged code, still claiming to be verbatim.
 * A transcription that says it is a copy is worse than one that does not, because it tells the
 * reader not to check.
 *
 * `.profile-cmd.txt` is asserted against `profileFor("sveltekit").typecheckCmd` by
 * `framework-profiles.sveltekit-fixture.test.ts`, which runs in the normal suite. So a future
 * profile change fails there rather than rotting here.
 */
const PROFILE_CMD = readFileSync(join(HERE, ".profile-cmd.txt"), "utf8").trim();
/** What the profile said BEFORE #81 — kept as the regression witness, see SK3a. */
const BARE_CHECK = "npx svelte-check --threshold error";
const BAD_PAGE = `<script lang="ts">
  import CleanBadge from '$lib/components/CleanBadge.svelte';
</script>
<CleanBadge label={42} />
`;

const results = [];
const record = (id, pass, note) => {
  results.push({ id, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${note}`);
};

// SK0 — false polarity. Without this an always-fail measurement passes everything.
{
  const r = run(PROFILE_CMD);
  // Both polarities: clean exit AND the failure matcher must NOT fire. Without the second half
  // an always-true matcher would sail through every other case.
  record(
    "SK0-clean",
    clean(r) && !failedWith(r, TYPE_MISMATCH),
    `clean synced project -> exit ${r.status}, matcher fires ${failedWith(r, TYPE_MISMATCH)} (must be false)`,
  );
}

// SK1 — a real SFC type error must surface its SPECIFIC diagnostic.
{
  copyFileSync("src/routes/+page.svelte", "/tmp/sk-page.bak");
  writeFileSync("src/routes/+page.svelte", BAD_PAGE);
  const r = run(PROFILE_CMD);
  record(
    "SK1-svelte-error",
    failedWith(r, TYPE_MISMATCH),
    `wrong prop type -> exit ${r.status}, specific message ${TYPE_MISMATCH.test(r.out)}, (ts) marker ${/\(ts\)/.test(r.out)}`,
  );
  copyFileSync("/tmp/sk-page.bak", "src/routes/+page.svelte");
}

// SK2 — plain tsc must NOT find that error. A real .ts exists, so TS18003 cannot fake a pass.
{
  copyFileSync("src/routes/+page.svelte", "/tmp/sk-page.bak");
  writeFileSync("src/routes/+page.svelte", BAD_PAGE);
  const r = run("npx tsc --noEmit");
  const foundIt = TYPE_MISMATCH.test(r.out);
  const emptyProject = /\bTS18003\b/.test(r.out);
  record(
    "SK2-tsc-blind",
    !foundIt && !emptyProject,
    `tsc -> exit ${r.status}, type-mismatch ${foundIt}, TS18003 ${emptyProject} (both must be false)`,
  );
  copyFileSync("/tmp/sk-page.bak", "src/routes/+page.svelte");
}

// SK3a — the DEFECT, asserted rather than logged. Thor was right that the decisive case was only
// console.log'd: the one thing here that could regress silently was the one thing not checked.
// This is the bare command the profile carried before #81, kept as the regression witness — it is
// what made the change necessary, and without it the repair below proves nothing.
{
  renameSync(".svelte-kit", ".svelte-kit-hidden");
  const r = run(BARE_CHECK);
  record(
    "SK3a-bare-check-fails-without-sync",
    r.status !== 0 && /\$types/.test(r.out),
    `bare svelte-check without .svelte-kit -> exit ${r.status}, mentions $types ${/\$types/.test(r.out)}`,
  );
  renameSync(".svelte-kit-hidden", ".svelte-kit");
}

// SK3b — the REPAIR. The current profile command self-prepares, so the same removal is survivable.
// Both polarities on the same condition: the old command fails where the new one succeeds.
{
  renameSync(".svelte-kit", ".svelte-kit-hidden");
  const r = run(PROFILE_CMD);
  record(
    "SK3b-profile-cmd-survives-no-sync",
    clean(r),
    `profile cmd without .svelte-kit -> exit ${r.status} (it runs svelte-kit sync itself)`,
  );
  if (!existsSync(".svelte-kit")) renameSync(".svelte-kit-hidden", ".svelte-kit");
  else rmSync(".svelte-kit-hidden", { recursive: true, force: true });
}

// SK4 — and restoring makes it clean again, proving SK3 was the generated types and not damage.
{
  const r = run(PROFILE_CMD);
  record("SK4-restored-clean", clean(r), `after restore -> exit ${r.status}`);
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} asserted cases passed`);
