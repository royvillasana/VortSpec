import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInside, readFile } from "./fs-workspace";

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
