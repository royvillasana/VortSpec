import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { stage, commit } from "./git-adapter";
import { wrapOption } from "../../shared/compose-scaffold";

/**
 * The commit guard (§6.16, design R4) is file-derived: `commit` scans the staged
 * files themselves for a scaffold marker and refuses if any is present. This runs
 * real git in a temp repo with NO canvas / renderer state involved — proving the
 * guard holds after a reload, a crash, or in a second window.
 */
function gitInit(dir: string): void {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@example.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Tester"], { cwd: dir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
}

describe("commit scaffold guard", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-git-guard-"));
    gitInit(dir);
    await mkdir(join(dir, "src"), { recursive: true });
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses a staged file carrying a scaffold, then proceeds once it is gone", async () => {
    const rel = "src/Home.tsx";
    const withScaffold = `export const Home = () => (\n  <div>\n${wrapOption("run-1", 0, "    <Card />")}\n  </div>\n);\n`;
    await writeFile(join(dir, rel), withScaffold, "utf8");
    expect((await stage(dir, [rel])).ok).toBe(true);

    const refused = await commit(dir, "add home");
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/composition preview is still live/i);
    expect(refused.message).toContain(rel);

    // Resolve the preview (as accept/discard would), re-stage, and commit proceeds.
    await writeFile(join(dir, rel), "export const Home = () => (\n  <div>\n    <Card />\n  </div>\n);\n", "utf8");
    expect((await stage(dir, [rel])).ok).toBe(true);
    const done = await commit(dir, "add home");
    expect(done.ok).toBe(true);
  });

  it("allows a commit when no staged file carries a scaffold", async () => {
    const rel = "src/Clean.tsx";
    await writeFile(join(dir, rel), "export const Clean = () => <span>ok</span>;\n", "utf8");
    expect((await stage(dir, [rel])).ok).toBe(true);
    expect((await commit(dir, "add clean")).ok).toBe(true);
  });
});
