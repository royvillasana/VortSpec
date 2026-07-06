import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normName, normValue, reconcile, readFigmaVariables } from "./figma-reconcile";

describe("normName", () => {
  it("canonicalizes across separators and casing", () => {
    expect(normName("--Color/Primary")).toBe("color-primary");
    expect(normName("color.primary")).toBe("color-primary");
    expect(normName("color_primary")).toBe("color-primary");
    expect(normName("  Color  Primary ")).toBe("color-primary");
  });
});

describe("normValue", () => {
  it("expands short hex and strips opaque alpha", () => {
    expect(normValue("#FFF")).toBe("#ffffff");
    expect(normValue("#087990FF")).toBe("#087990");
    expect(normValue("#087990")).toBe(normValue("#087990"));
  });
  it("treats a translucent alpha as significant (not stripped)", () => {
    expect(normValue("#08799080")).toBe("#08799080");
  });
  it("collapses whitespace for multi-part values", () => {
    expect(normValue("0 1px  2px   rgba(0,0,0,0.05)")).toBe("0 1px 2px rgba(0,0,0,0.05)");
  });
});

describe("reconcile", () => {
  const tokens = [
    { name: "color-primary", resolvedValue: "#087990" },
    { name: "color-text", resolvedValue: "#212529" },
    { name: "radius-8", resolvedValue: "8px" },
  ];

  it("flags in-sync when values match (name form differs)", () => {
    const r = reconcile(tokens, [{ name: "color/primary", resolvedValue: "#087990" }]);
    expect(r.byName.get("color-primary")?.drift).toBe("in-sync");
  });

  it("flags drifted when the code value differs from Figma", () => {
    const r = reconcile(tokens, [{ name: "color/text", resolvedValue: "#000000" }]);
    const m = r.byName.get("color-text");
    expect(m?.drift).toBe("drifted");
    expect(m?.figmaValue).toBe("#000000");
  });

  it("matches hex case-insensitively as in-sync", () => {
    const r = reconcile(tokens, [{ name: "color-primary", resolvedValue: "#087990" }]);
    expect(r.byName.get("color-primary")?.drift).toBe("in-sync");
  });

  it("lists Figma variables with no code token as figma-only", () => {
    const r = reconcile(tokens, [
      { name: "color-primary", resolvedValue: "#087990" },
      { name: "color-accent", resolvedValue: "#7C6FF0" },
    ]);
    expect(r.figmaOnly.map((v) => v.name)).toEqual(["color-accent"]);
  });

  it("keeps the first mode when a variable name repeats", () => {
    const r = reconcile(tokens, [
      { name: "color-primary", resolvedValue: "#087990" },
      { name: "color-primary", resolvedValue: "#000000" },
    ]);
    expect(r.byName.get("color-primary")?.drift).toBe("in-sync");
  });
});

describe("readFigmaVariables", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-figma-"));
    await mkdir(join(dir, ".vortspec"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when no export exists (→ not synced)", async () => {
    expect(await readFigmaVariables(dir)).toBeNull();
  });

  it("parses the array-of-objects shape", async () => {
    await writeFile(
      join(dir, ".vortspec/figma-variables.json"),
      JSON.stringify([{ name: "color/primary", resolvedValue: "#087990", type: "color" }]),
      "utf8",
    );
    const vars = await readFigmaVariables(dir);
    expect(vars).toEqual([{ name: "color/primary", resolvedValue: "#087990", type: "color" }]);
  });

  it("tolerates a flat name→value map and a `value` key alias", async () => {
    await writeFile(
      join(dir, ".vortspec/figma-variables.json"),
      JSON.stringify({ "color/primary": "#087990" }),
      "utf8",
    );
    const vars = await readFigmaVariables(dir);
    expect(vars).toEqual([{ name: "color/primary", resolvedValue: "#087990" }]);
  });

  it("returns [] for malformed rows rather than throwing", async () => {
    await writeFile(
      join(dir, ".vortspec/figma-variables.json"),
      JSON.stringify([{ nope: 1 }, "garbage", null]),
      "utf8",
    );
    expect(await readFigmaVariables(dir)).toEqual([]);
  });
});
