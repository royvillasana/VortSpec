import { describe, expect, it } from "vitest";
import { resolveInside } from "./fs-workspace";

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
