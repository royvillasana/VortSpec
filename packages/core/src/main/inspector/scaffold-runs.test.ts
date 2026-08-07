import { describe, expect, it, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { scaffoldComponent } from "./scaffold";

const run = promisify(execFile);

/**
 * Task 6.4, second half: the generated smoke test must actually PASS under a real runner, not merely
 * look like a test.
 *
 * Executed for the `vanilla` framework because its smoke test needs only `node:fs` — this repository
 * has no DOM harness at all (no @testing-library, no jsdom, no happy-dom; component behaviour is
 * covered by Playwright CT instead), so the React/Vue/Svelte smoke tests CANNOT be executed here.
 * Their correctness is asserted structurally in `shared/scaffold.test.ts`. Stating that plainly beats
 * a test named "the runner passes" that only ever ran the one case it could.
 */

// Inside the package so the scaffolded test resolves `vitest` through the real workspace, exactly as
// a project's own test would.
const SANDBOX = join(process.cwd(), ".scaffold-smoke");

afterEach(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});

describe("the scaffolded smoke test passes under a real runner (task 6.4)", () => {
  it("runs green on a freshly scaffolded component", async () => {
    await mkdir(SANDBOX, { recursive: true });
    await mkdir(join(SANDBOX, ".sdd-de"), { recursive: true });
    // `src/components` rather than `components` so the scaffolded test matches this package's own
    // vitest `include` when the runner is pointed at the sandbox — the runner is real, so its
    // configuration is real too.
    await writeFile(
      join(SANDBOX, ".sdd-de/project.yaml"),
      "framework: vanilla\nlanguage: typescript\nstyling: css\ncomponent_dir: src/components\n",
      "utf8",
    );

    const result = await scaffoldComponent(SANDBOX, { name: "Callout" });
    const test = result.written.find((path) => path.endsWith(".test.ts"));
    expect(test).toBeDefined();

    const { stdout, stderr } = await run(
      "npx",
      ["vitest", "run", "--root", SANDBOX, "--environment", "node", "--reporter", "basic"],
      { cwd: process.cwd(), timeout: 120_000 },
    );
    expect(`${stdout}${stderr}`).toMatch(/1 passed|Tests\s+1 passed/);
  }, 180_000);
});
