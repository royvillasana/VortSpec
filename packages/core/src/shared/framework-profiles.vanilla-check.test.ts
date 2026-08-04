import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GENERATED_DIRS, vanillaCheckCmd, resolveTypecheck } from "./framework-profiles";

/**
 * `vanillaCheckCmd` EXECUTED, against real files.
 *
 * Vanilla is the one framework whose check VortSpec builds itself rather than delegating to a
 * vendor tool, and the function's own comment names three shapes it rejected because each could
 * pass without checking — `-exec … {} +` reading only the first argument, `-exec … \;` discarding
 * the child's status, and a pipeline returning only the last command's status. Those are claims
 * about the shipped string, and nothing verified them: the other framework fixtures compile a real
 * toolchain, but this command is ours, so it can be run here against the real function rather than
 * a transcription of it. A copy of the command in a fixture would test my typing.
 *
 * Every case uses its own `mkdtemp`. The shared-fixture failures earlier in this work are reason
 * enough not to reuse a directory.
 */

const run = (cmd: string, cwd: string): { status: number; out: string } => {
  try {
    const out = execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

async function project(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vortspec-vanilla-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, body, "utf8");
  }
  return dir;
}

const GOOD = "export function ok() { return 1; }\n";
/**
 * A syntax error `node --check` detects in EVERY module mode, so the plumbing cases below measure
 * the command (batching, pruning, traversal) rather than node's module detection. An earlier draft
 * used `export function f( {` and VA1/VA2 failed — not because the command was broken but because
 * `node --check` cannot see ESM-syntax errors in an ambiguous file. That is a real finding and it
 * has its own describe block; it must not be tangled into the plumbing assertions.
 */
const BAD = "const dup = 1;\nconst dup = 2;\n";
/** An error expressible only in ES-module syntax — invisible unless the module mode is decided. */
const BAD_ESM = "export function broken( {\n";
const CMD = vanillaCheckCmd("src")!;

describe("vanillaCheckCmd — executed against real files", () => {
  // The false polarity. Without it every assertion below is satisfied by a command that always
  // fails, and the suite would read as a working gate while proving nothing.
  it("VA0 — a clean component dir passes", async () => {
    const dir = await project({ "src/button.js": GOOD, "src/card.js": GOOD });
    try {
      const r = run(CMD, dir);
      expect(r.status, r.out).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("VA1 — a syntax error in a component fails, and names the file", async () => {
    const dir = await project({ "src/button.js": BAD });
    try {
      const r = run(CMD, dir);
      expect(r.status).not.toBe(0);
      expect(r.out).toMatch(/button\.js/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // The batching trap the comment claims to have avoided: `node --check` reads only its FIRST
  // argument, so a naive `-exec … {} +` would check `a.js`, pass, and never look at `b.js`.
  // This is the case that distinguishes the shipped loop from the shape it rejected.
  it("VA2 — a bad file that is NOT first in the batch is still caught", async () => {
    const dir = await project({
      "src/a-good.js": GOOD,
      "src/b-good.js": GOOD,
      "src/c-bad.js": BAD,
    });
    try {
      const r = run(CMD, dir);
      expect(r.status, "a later file in the batch went unchecked").not.toBe(0);
      expect(r.out).toMatch(/c-bad\.js/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // The scoping claim — the reason `typecheckScope: "component-dir"` exists at all. Broken
  // generated or vendored JS must not block a component whose own source is fine.
  it.each(GENERATED_DIRS.filter((d) => d !== ".git"))(
    "VA3 — broken JS under %s does not fail the check",
    async (generated) => {
      const dir = await project({
        "src/button.js": GOOD,
        [`src/${generated}/bundle.js`]: BAD,
      });
      try {
        const r = run(CMD, dir);
        expect(r.status, `${generated} was swept into the check: ${r.out}`).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  // And the other polarity of the same rule: pruning must not become "check nothing". A broken
  // file OUTSIDE a generated dir is still caught even when a generated dir is present.
  it("VA3b — pruning does not disable the check for real sources", async () => {
    const dir = await project({
      "src/node_modules/vendor.js": BAD,
      "src/button.js": BAD,
    });
    try {
      const r = run(CMD, dir);
      expect(r.status).not.toBe(0);
      expect(r.out).toMatch(/button\.js/);
      expect(r.out).not.toMatch(/vendor\.js/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // "find … also fails on its own traversal errors, so a missing or unreadable directory is a
  // failure rather than a pass." A gate that reports success for a directory it never read is
  // the exact defect this whole thread has been removing.
  it("VA4 — a missing component dir FAILS rather than passing vacuously", async () => {
    const dir = await project({ "somewhere-else/x.js": GOOD });
    try {
      const r = run(CMD, dir);
      expect(r.status, "a nonexistent component dir reported success").not.toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Recorded as an observation, not a defect: the command greps `-name '*.js'`, so the HTML
  // partial — which the profile calls "the component file" — is never examined. The gate is a
  // JS-syntax check, and the profile's own pitfall already says the CODE layer must not report a
  // pass for vanilla. This pins the scope of what it does check so the pitfall stays true.
  it("VA5 — malformed HTML is NOT examined; this is a JS-syntax gate only", async () => {
    const dir = await project({
      "src/button.js": GOOD,
      "src/button.html": "<div class='btn'><span>unclosed",
    });
    try {
      const r = run(CMD, dir);
      expect(r.status, r.out).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveTypecheck routes vanilla through the scoped command", () => {
  it("uses the project's own component dir", () => {
    const r = resolveTypecheck("vanilla", { componentDir: "app/ui" });
    expect(r.kind).toBe("cmd");
    if (r.kind === "cmd") expect(r.cmd).toContain("app/ui");
  });

  it("declares its shortfall rather than reporting full coverage", () => {
    const r = resolveTypecheck("vanilla", { componentDir: "src" });
    if (r.kind === "cmd") expect(r.partial).toBeTruthy();
  });
});

/**
 * The finding: `node --check` is blind to ES-module syntax errors when the module mode is
 * AMBIGUOUS — which is precisely the project shape vanilla describes.
 *
 * The vanilla profile mandates ES modules (`exports: "ES module named exports for any JS
 * behaviour"`, `events: "addEventListener in an ES module"`) and says the target has "no build
 * step, no bundler". A project like that plausibly has no `package.json` at all — and with none,
 * node cannot decide whether a `.js` file is CJS or ESM, so an error in `import`/`export` syntax
 * is silently accepted. Add EITHER `"type": "module"` or `"type": "commonjs"` and the same file
 * fails. The mode does not have to be right; it has to be DECIDED.
 *
 * So the gate is blind to exactly the syntax the profile tells vanilla authors to write, in
 * exactly the project shape the profile describes. Recorded here rather than fixed: the remedy is
 * a judgement about the command, and this thread's rule is that the fixture establishes the fact
 * and the record's owner decides which claim changes.
 */
describe("node --check module-mode blindness", () => {
  const esmProject = (pkg?: string) =>
    project(pkg ? { "src/bad.js": BAD_ESM, "package.json": pkg } : { "src/bad.js": BAD_ESM });

  it("MISSES an ESM syntax error when no package.json decides the module mode", async () => {
    const dir = await esmProject();
    try {
      const r = run(CMD, dir);
      // Documenting observed behaviour: this is the gap, asserted so a node upgrade that closes
      // it fails here and tells us rather than going quiet.
      expect(r.status, "node --check now detects this; the profile note can be revisited").toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([['{"type":"module"}'], ['{"type":"commonjs"}']])(
    "CATCHES the same error once %s decides the mode",
    async (pkg) => {
      const dir = await esmProject(pkg);
      try {
        expect(run(CMD, dir).status).not.toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  it("catches a NON-module syntax error either way — the gate is not simply dead", async () => {
    const dir = await project({ "src/bad.js": BAD });
    try {
      expect(run(CMD, dir).status).not.toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
