import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normName,
  normValue,
  reconcile,
  readFigmaVariables,
  readFigmaVariableModel,
  reconcileComponents,
  readFigmaComponents,
  variableValueInMode,
  figmaGroup,
  figmaSegments,
} from "./figma-reconcile";
import type { FigmaVariable } from "@vortspec/core/inspector";

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
  it("normalizes dimension units so px/rem/unitless match (Figma FLOATs are unitless)", () => {
    expect(normValue("18px")).toBe("18");
    expect(normValue("18")).toBe("18");
    expect(normValue("1.5rem")).toBe("1.5");
    expect(normValue("0")).toBe(normValue("0px"));
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

describe("reconcileComponents", () => {
  const code = ["Button", "InputField", "Card"];

  it("marks code components figma-backed and carries variant axes", () => {
    const r = reconcileComponents(code, [
      { name: "button", isSet: true, variants: ["Type", "Size"] },
      { name: "input-field", isSet: true, variants: ["State"] },
    ]);
    expect(r.byName.get("button")).toEqual({ figmaVariants: ["Type", "Size"], isSet: true });
    // "InputField" (code) ↔ "input-field" (Figma) both canonicalize to "inputfield".
    expect(r.byName.get("inputfield")?.figmaVariants).toEqual(["State"]);
  });

  it("lists Figma components with no code match as figma-only (designed, not built)", () => {
    const r = reconcileComponents(code, [
      { name: "Button", isSet: false, variants: [] },
      { name: "Tooltip", isSet: true, variants: ["Placement"] },
    ]);
    expect(r.figmaOnly.map((c) => c.name)).toEqual(["Tooltip"]);
  });

  it("dedupes repeated Figma names by normalized form", () => {
    const r = reconcileComponents(code, [
      { name: "Card", isSet: false, variants: [] },
      { name: "card", isSet: true, variants: ["Elevated"] },
    ]);
    expect(r.byName.get("card")?.isSet).toBe(false); // first wins
    expect(r.figmaOnly).toEqual([]);
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

  it("reads figma-components.json (Wave 3) and skips malformed rows", async () => {
    await writeFile(
      join(dir, ".vortspec/figma-components.json"),
      JSON.stringify([
        { name: "Button", isSet: true, variants: ["Type"] },
        { nope: 1 },
        "garbage",
      ]),
      "utf8",
    );
    expect(await readFigmaComponents(dir)).toEqual([
      { name: "Button", isSet: true, variants: ["Type"] },
    ]);
    // absent file → null
    await rm(join(dir, ".vortspec/figma-components.json"));
    expect(await readFigmaComponents(dir)).toBeNull();
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

describe("figma group helpers", () => {
  it("splits a slash path into segments and group folders", () => {
    expect(figmaSegments("primitive/color/primary")).toEqual(["primitive", "color", "primary"]);
    expect(figmaGroup("primitive/color/primary")).toEqual(["primitive", "color"]);
    expect(figmaGroup("flat")).toEqual([]);
  });
});

describe("variableValueInMode", () => {
  const v: FigmaVariable = {
    name: "color/primary",
    resolvedValue: "#7C6FF0",
    valuesByMode: { Light: { value: "#7C6FF0" }, Dark: { value: "#2A2540" } },
  };
  it("returns the value for the named mode", () => {
    expect(variableValueInMode(v, "Dark")).toBe("#2A2540");
    expect(variableValueInMode(v, "Light")).toBe("#7C6FF0");
  });
  it("falls back to the default mode then the flat value", () => {
    expect(variableValueInMode(v, "Missing", "Light")).toBe("#7C6FF0");
    expect(variableValueInMode({ name: "x", resolvedValue: "#000" }, "Dark")).toBe("#000");
  });
});

describe("readFigmaVariableModel", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-model-"));
    await mkdir(join(dir, ".vortspec"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses the new object shape (collections + modes + valuesByMode)", async () => {
    const model = {
      collections: [
        { name: "Theme", modes: [{ id: "1:0", name: "Light" }, { id: "1:1", name: "Dark" }], defaultModeId: "1:0" },
      ],
      variables: [
        {
          name: "color/primary",
          resolvedValue: "#7C6FF0",
          collection: "Theme",
          resolvedType: "COLOR",
          valuesByMode: { Light: { value: "#7C6FF0" }, Dark: { value: "#2A2540" } },
        },
      ],
    };
    await writeFile(join(dir, ".vortspec/figma-variables.json"), JSON.stringify(model), "utf8");
    const parsed = await readFigmaVariableModel(dir);
    expect(parsed?.collections[0].modes.map((m) => m.name)).toEqual(["Light", "Dark"]);
    expect(parsed?.variables[0].valuesByMode?.Dark.value).toBe("#2A2540");
    // Back-compat reader returns the flat variable list unchanged.
    expect((await readFigmaVariables(dir))?.[0].name).toBe("color/primary");
  });

  it("wraps a legacy flat array as a single Default-mode collection", async () => {
    await writeFile(
      join(dir, ".vortspec/figma-variables.json"),
      JSON.stringify([{ name: "color/primary", resolvedValue: "#087990" }]),
      "utf8",
    );
    const parsed = await readFigmaVariableModel(dir);
    expect(parsed?.collections).toHaveLength(1);
    expect(parsed?.collections[0].modes).toEqual([{ id: "Default", name: "Default" }]);
    expect(parsed?.variables).toEqual([{ name: "color/primary", resolvedValue: "#087990" }]);
  });
});
