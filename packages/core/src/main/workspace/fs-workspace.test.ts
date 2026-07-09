import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInside, readFile, searchFiles } from "./fs-workspace";

describe("resolveInside (workspace-root path guard)", () => {
  const root = "/Users/dev/project";

  it("resolves paths inside the root", () => {
    expect(resolveInside(root, "src/index.ts")).toBe("/Users/dev/project/src/index.ts");
    expect(resolveInside(root, "")).toBe("/Users/dev/project");
    expect(resolveInside(root, ".")).toBe("/Users/dev/project");
  });

  it("rejects paths that escape via ..", () => {
    expect(() => resolveInside(root, "../secrets")).toThrow(/escapes/);
    expect(() => resolveInside(root, "src/../../etc/passwd")).toThrow(/escapes/);
    expect(() => resolveInside(root, "../../")).toThrow(/escapes/);
  });

  it("rejects absolute paths outside the root", () => {
    expect(() => resolveInside(root, "/etc/passwd")).toThrow(/escapes/);
    expect(() => resolveInside(root, "/Users/dev/project-other/x")).toThrow(/escapes/);
  });

  it("allows an absolute path that stays inside the root", () => {
    expect(resolveInside(root, "/Users/dev/project/src/a.ts")).toBe(
      "/Users/dev/project/src/a.ts",
    );
  });

  it("does not treat a sibling with the same prefix as inside", () => {
    // /Users/dev/project-2 shares the "project" prefix but is not inside.
    expect(() => resolveInside(root, "../project-2/x")).toThrow(/escapes/);
  });
});

describe("readFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-fs-"));
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "a.txt"), "hello", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a text file", async () => {
    expect(await readFile(dir, "a.txt")).toEqual({ path: "a.txt", content: "hello", truncated: false });
  });

  it("returns truncated (not EISDIR) for a directory", async () => {
    const r = await readFile(dir, "src");
    expect(r.truncated).toBe(true);
    expect(r.content).toBe("");
  });
});

describe("searchFiles (@-mention picker)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-search-"));
    await mkdir(join(dir, "src", "components"), { recursive: true });
    await mkdir(join(dir, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(dir, "src", "components", "Button.tsx"), "x", "utf8");
    await writeFile(join(dir, "src", "index.ts"), "x", "utf8");
    await writeFile(join(dir, "README.md"), "x", "utf8");
    await writeFile(join(dir, "node_modules", "left-pad", "index.js"), "x", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("substring-matches on the relative path", async () => {
    const r = await searchFiles(dir, "button");
    expect(r.map((e) => e.path)).toContain("src/components/Button.tsx");
  });

  it("fuzzy (subsequence) matches", async () => {
    const r = await searchFiles(dir, "srcbtn");
    expect(r.map((e) => e.path)).toContain("src/components/Button.tsx");
  });

  it("skips node_modules", async () => {
    const r = await searchFiles(dir, "index");
    expect(r.map((e) => e.path)).toContain("src/index.ts");
    expect(r.some((e) => e.path.includes("node_modules"))).toBe(false);
  });

  it("returns folders too and respects the limit", async () => {
    const all = await searchFiles(dir, "", 2);
    expect(all.length).toBeLessThanOrEqual(2);
    const dirs = await searchFiles(dir, "components");
    expect(dirs.some((e) => e.type === "dir" && e.path === "src/components")).toBe(true);
  });
});
