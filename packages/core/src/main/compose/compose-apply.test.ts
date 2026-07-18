import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { acceptComposition, sweepComposition, checkComposeTarget, sweepProjectScaffold } from "./compose-apply";
import { wrapOption, hasScaffold } from "../../shared/compose-scaffold";

// A file the composition run wrote: two option blocks around real content.
function scaffolded(runId = "r1"): string {
  return [
    "export const Row = () => (",
    "  <div>",
    "    <Existing />",
    wrapOption(runId, 0, "    <Card variant='a' />"),
    wrapOption(runId, 1, "    <Card variant='b' />"),
    "  </div>",
    ");",
    "",
  ].join("\n");
}

describe("acceptComposition / sweepComposition", () => {
  let dir: string;
  const rel = "src/Row.tsx";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-compose-"));
    await mkdir(join(dir, "src"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("accept keeps the chosen option and removes all markers", async () => {
    await writeFile(join(dir, rel), scaffolded(), "utf8");
    const res = await acceptComposition(dir, rel, "r1", 1);
    expect(res.ok).toBe(true);
    const out = await readFile(join(dir, rel), "utf8");
    expect(hasScaffold(out)).toBe(false);
    expect(out).toContain("<Card variant='b' />");
    expect(out).not.toContain("<Card variant='a' />");
    expect(out).toContain("<Existing />");
  });

  it("accept is idempotent on an already-accepted file", async () => {
    await writeFile(join(dir, rel), scaffolded(), "utf8");
    await acceptComposition(dir, rel, "r1", 0);
    const once = await readFile(join(dir, rel), "utf8");
    await acceptComposition(dir, rel, "r1", 0);
    expect(await readFile(join(dir, rel), "utf8")).toBe(once);
  });

  it("accept reports a failure for a missing file rather than throwing", async () => {
    const res = await acceptComposition(dir, "src/Nope.tsx", "r1", 0);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Could not read/);
  });

  it("sweep strips every scaffold from the listed files (cancel/error/crash cleanup)", async () => {
    await writeFile(join(dir, rel), scaffolded(), "utf8");
    const clean = "export const Clean = () => <span>ok</span>;\n";
    await writeFile(join(dir, "src/Clean.tsx"), clean, "utf8");
    await sweepComposition(dir, [rel, "src/Clean.tsx", "src/Absent.tsx"]);
    expect(hasScaffold(await readFile(join(dir, rel), "utf8"))).toBe(false);
    // A file with no scaffold is left byte-identical.
    expect(await readFile(join(dir, "src/Clean.tsx"), "utf8")).toBe(clean);
  });

  it("sweep is idempotent", async () => {
    await writeFile(join(dir, rel), scaffolded(), "utf8");
    await sweepComposition(dir, [rel]);
    const once = await readFile(join(dir, rel), "utf8");
    await sweepComposition(dir, [rel]);
    expect(await readFile(join(dir, rel), "utf8")).toBe(once);
  });
});

describe("acceptComposition — generated/untracked refusal (§6.8)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-compose-git-"));
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.dev"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: dir });
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, ".gitignore"), "dist/\n", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses to accept into an untracked file, leaving it unchanged", async () => {
    const rel = "src/New.tsx";
    const before = scaffolded();
    await writeFile(join(dir, rel), before, "utf8"); // written but never `git add`ed
    const res = await acceptComposition(dir, rel, "r1", 0);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/isn't tracked/);
    expect(await readFile(join(dir, rel), "utf8")).toBe(before); // untouched
  });

  it("refuses to accept into a git-ignored file", async () => {
    await mkdir(join(dir, "dist"), { recursive: true });
    const rel = "dist/Built.tsx";
    await writeFile(join(dir, rel), scaffolded(), "utf8");
    const res = await acceptComposition(dir, rel, "r1", 0);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/git-ignored/);
  });

  it("accepts into a tracked source file", async () => {
    const rel = "src/Row.tsx";
    await writeFile(join(dir, rel), scaffolded(), "utf8");
    execFileSync("git", ["add", rel], { cwd: dir });
    const res = await acceptComposition(dir, rel, "r1", 0);
    expect(res.ok).toBe(true);
    expect(hasScaffold(await readFile(join(dir, rel), "utf8"))).toBe(false);
  });

  it("checkComposeTarget mirrors the refusal for the host pre-check", async () => {
    await writeFile(join(dir, "src/Untracked.tsx"), "x", "utf8");
    expect((await checkComposeTarget(dir, "src/Untracked.tsx")).ok).toBe(false);
    const tracked = "src/Tracked.tsx";
    await writeFile(join(dir, tracked), "x", "utf8");
    execFileSync("git", ["add", tracked], { cwd: dir });
    expect((await checkComposeTarget(dir, tracked)).ok).toBe(true);
  });
});

describe("sweepProjectScaffold — crash recovery (§7.4)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-compose-sweep-"));
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.dev"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: dir });
    await mkdir(join(dir, "src"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds and strips a scaffold orphaned by a crash, with no record of the file", async () => {
    // Simulate a run that wrote a scaffold and then the app died before accept.
    const rel = "src/Row.tsx";
    const clean = "export const Clean = () => <span>ok</span>;\n";
    await writeFile(join(dir, rel), `export const Row = () => (<div>${wrapOption("r1", 0, "<Card />")}</div>);\n`, "utf8");
    await writeFile(join(dir, "src/Clean.tsx"), clean, "utf8");
    execFileSync("git", ["add", "-A"], { cwd: dir });

    const { swept } = await sweepProjectScaffold(dir);
    expect(swept).toContain(rel);
    expect(hasScaffold(await readFile(join(dir, rel), "utf8"))).toBe(false);
    // Untouched files stay byte-identical.
    expect(await readFile(join(dir, "src/Clean.tsx"), "utf8")).toBe(clean);
  });

  it("also sweeps an untracked (but not ignored) orphaned scaffold", async () => {
    const rel = "src/New.tsx";
    await writeFile(join(dir, rel), wrapOption("r1", 0, "<Card />"), "utf8"); // never git-added
    const { swept } = await sweepProjectScaffold(dir);
    expect(swept).toContain(rel);
    expect(hasScaffold(await readFile(join(dir, rel), "utf8"))).toBe(false);
  });

  it("is a no-op on a clean project", async () => {
    await writeFile(join(dir, "src/Clean.tsx"), "export const C = () => null;\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    expect((await sweepProjectScaffold(dir)).swept).toEqual([]);
  });
});
