/**
 * Entry point for the browser fixture, named `verify.mjs` for the reason every other fixture is.
 *
 * NOT cosmetic. `framework-profiles.fixture-cmd.test.ts` decides what counts as a fixture by
 * looking for `verify.mjs` OR `.profile-cmd.txt` on disk, and this directory originally had
 * NEITHER — its runner lived in `package.json` as `npm run verify`. Measured on this branch
 * rebased onto main: the completeness guard passed 12/12 with this whole fixture present and
 * unguarded. It was invisible to the check whose entire job is to find fixtures nobody opted in.
 *
 * So this file exists to be SEEN, and the seeing is what makes the exemption in that guard's
 * `NO_PROFILE_CMD` list a checked claim rather than an absent one.
 *
 * The exemption itself is honest: this harness renders CSS in a real browser and reads
 * `getComputedStyle`. It invokes no framework typecheck, so it has no profile command to drift
 * from — the same carve-out `accordion-render` has, for the same reason.
 */
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// The one command the fixture runs, kept in package.json so `npm run verify` and this file cannot
// disagree about what "running the fixture" means.
const r = spawnSync('npm', ['run', '--silent', 'verify'], {
  cwd: ROOT,
  stdio: 'inherit',
  encoding: 'utf8',
});

process.exit(r.status === null ? 1 : r.status);
