import { describe, expect, it } from "vitest";
import {
  parseFilesJson,
  parseMode,
  dtcgToVariables,
  mapDtcgType,
  parseComponentsEval,
  parseSelectionEval,
  connectModeOrder,
  buildVariablesFetchScript,
  parseVariablesFetch,
} from "./figma-cli";

describe("connectModeOrder (auto-connect)", () => {
  it("prefers yolo by default and when yolo last worked", () => {
    expect(connectModeOrder(null)).toEqual(["yolo", "safe"]);
    expect(connectModeOrder("yolo")).toEqual(["yolo", "safe"]);
  });
  it("prefers the last-working mode when it was safe", () => {
    expect(connectModeOrder("safe")).toEqual(["safe", "yolo"]);
  });
});

describe("parseFilesJson", () => {
  it("parses a JSON array of file names (string or object)", () => {
    expect(parseFilesJson('[{"name":"Design System"},{"name":"App"}]')).toEqual([
      "Design System",
      "App",
    ]);
    expect(parseFilesJson('["A","B"]')).toEqual(["A", "B"]);
  });

  it("tolerates a banner before the JSON", () => {
    expect(parseFilesJson('✨ figma-cli\nOpen files:\n[{"title":"Untitled"}]\n')).toEqual([
      "Untitled",
    ]);
  });

  it("returns [] on no JSON or malformed output", () => {
    expect(parseFilesJson("not connected")).toEqual([]);
    expect(parseFilesJson("[oops")).toEqual([]);
    expect(parseFilesJson("")).toEqual([]);
  });
});

describe("parseMode", () => {
  it("detects safe mode", () => {
    expect(parseMode("Daemon running in Safe Mode")).toBe("safe");
  });
  it("detects yolo/CDP mode", () => {
    expect(parseMode("Yolo Mode (direct CDP connection)")).toBe("yolo");
    expect(parseMode("connected via CDP")).toBe("yolo");
  });
  it("returns null when unknown", () => {
    expect(parseMode("Daemon running on port 3456")).toBeNull();
  });
});

describe("mapDtcgType", () => {
  it("maps color and gradient to color", () => {
    expect(mapDtcgType("color", "brand/primary")).toBe("color");
    expect(mapDtcgType("gradient", "hero/bg")).toBe("color");
  });
  it("maps shadow types to shadow", () => {
    expect(mapDtcgType("shadow", "elevation/1")).toBe("shadow");
  });
  it("maps font-related types to typography", () => {
    expect(mapDtcgType("fontFamily", "font/body")).toBe("typography");
    expect(mapDtcgType("typography", "heading/lg")).toBe("typography");
  });
  it("uses the name hint for radius", () => {
    expect(mapDtcgType("dimension", "radius/md")).toBe("radius");
    expect(mapDtcgType("dimension", "corner-rounded")).toBe("radius");
  });
  it("maps plain dimensions/numbers to spacing", () => {
    expect(mapDtcgType("dimension", "space/4")).toBe("spacing");
    expect(mapDtcgType("number", "z-index/modal")).toBe("spacing");
  });
  it("falls back to other for unknown types", () => {
    expect(mapDtcgType("duration", "motion/fast")).toBe("spacing");
    expect(mapDtcgType(undefined, "misc/thing")).toBe("other");
  });
});

describe("dtcgToVariables", () => {
  it("flattens nested groups into slash-joined names with concrete values", () => {
    const dtcg = {
      "brand-primary": {
        "100": { $type: "color", $value: "#e6f2f4" },
        "500": { $type: "color", $value: "#087990" },
      },
      radius: { md: { $type: "dimension", $value: "8px" } },
    };
    expect(dtcgToVariables(dtcg)).toEqual([
      { name: "brand-primary/100", resolvedValue: "#e6f2f4", type: "color" },
      { name: "brand-primary/500", resolvedValue: "#087990", type: "color" },
      { name: "radius/md", resolvedValue: "8px", type: "radius" },
    ]);
  });

  it("inherits $type from an ancestor group that declares one", () => {
    const dtcg = { color: { $type: "color", neutral: { white: { $value: "#ffffff" } } } };
    expect(dtcgToVariables(dtcg)).toEqual([
      { name: "color/neutral/white", resolvedValue: "#ffffff", type: "color" },
    ]);
  });

  it("stringifies composite ($value objects) and ignores $-meta keys", () => {
    const dtcg = {
      $description: "root",
      shadow: {
        sm: { $type: "shadow", $value: { color: "#000", offsetX: "0", offsetY: "1px" }, $description: "small" },
      },
    };
    expect(dtcgToVariables(dtcg)).toEqual([
      {
        name: "shadow/sm",
        resolvedValue: JSON.stringify({ color: "#000", offsetX: "0", offsetY: "1px" }),
        type: "shadow",
      },
    ]);
  });

  it("returns [] for non-object / empty input", () => {
    expect(dtcgToVariables(null)).toEqual([]);
    expect(dtcgToVariables("nope")).toEqual([]);
    expect(dtcgToVariables({})).toEqual([]);
  });
});

describe("parseComponentsEval", () => {
  it("parses the eval JSON array (sets keep variant axes)", () => {
    const raw = JSON.stringify([
      { name: "Button", isSet: true, variants: ["Type", "Size"] },
      { name: "Logo", isSet: false, variants: [] },
    ]);
    expect(parseComponentsEval(raw)).toEqual([
      { name: "Button", isSet: true, variants: ["Type", "Size"] },
      { name: "Logo", isSet: false, variants: [] },
    ]);
  });

  it("tolerates a banner before the JSON and dedupes by name", () => {
    const raw = '✨ figma-cli\n[{"name":"Card","isSet":false},{"name":"Card","isSet":true}]';
    expect(parseComponentsEval(raw)).toEqual([{ name: "Card", isSet: false, variants: [] }]);
  });

  it("drops malformed rows and non-string variants", () => {
    const raw = JSON.stringify([
      { name: "", isSet: true },
      42,
      { name: "Input", isSet: true, variants: ["State", 7, null] },
    ]);
    expect(parseComponentsEval(raw)).toEqual([
      { name: "Input", isSet: true, variants: ["State"] },
    ]);
  });

  it("returns [] on no JSON / malformed output", () => {
    expect(parseComponentsEval("not connected")).toEqual([]);
    expect(parseComponentsEval("[oops")).toEqual([]);
    expect(parseComponentsEval("")).toEqual([]);
  });
});

describe("parseSelectionEval", () => {
  it("parses selected nodes (id/name/type)", () => {
    const raw = JSON.stringify([{ id: "12:34", name: "Button", type: "COMPONENT_SET" }]);
    expect(parseSelectionEval(raw)).toEqual([{ id: "12:34", name: "Button", type: "COMPONENT_SET" }]);
  });

  it("returns [] for an empty selection", () => {
    expect(parseSelectionEval("[]")).toEqual([]);
  });

  it("drops rows missing an id or name", () => {
    const raw = JSON.stringify([
      { name: "NoId", type: "FRAME" },
      { id: "9:9", type: "FRAME" },
      { id: "1:2", name: "Card", type: "FRAME" },
    ]);
    expect(parseSelectionEval(raw)).toEqual([{ id: "1:2", name: "Card", type: "FRAME" }]);
  });

  it("tolerates a banner and malformed output", () => {
    expect(parseSelectionEval('banner\n[{"id":"1:1","name":"A","type":"FRAME"}]')).toEqual([
      { id: "1:1", name: "A", type: "FRAME" },
    ]);
    expect(parseSelectionEval("nope")).toEqual([]);
  });
});

describe("buildVariablesFetchScript", () => {
  const script = buildVariablesFetchScript();
  it("reads collections + variables via the plugin API and keeps modes/aliases", () => {
    expect(script).toContain("getLocalVariableCollectionsAsync");
    expect(script).toContain("getLocalVariablesAsync");
    expect(script).toContain("valuesByMode");
    expect(script).toContain("VARIABLE_ALIAS");
    expect(script).toContain("resolvedType");
  });
});

describe("parseVariablesFetch", () => {
  it("parses a model behind a CLI banner", () => {
    const raw =
      'figma-cli v1\nconnected\n{"collections":[{"name":"Theme","modes":[{"id":"1:0","name":"Light"}],"defaultModeId":"1:0"}],"variables":[{"name":"color/primary","resolvedValue":"#7C6FF0","collection":"Theme","resolvedType":"COLOR","valuesByMode":{"Light":{"value":"#7C6FF0"}}}]}\n';
    const model = parseVariablesFetch(raw);
    expect(model?.collections[0].modes[0].name).toBe("Light");
    expect(model?.variables[0].valuesByMode?.Light.value).toBe("#7C6FF0");
  });
  it("returns null when there is no JSON object", () => {
    expect(parseVariablesFetch("no json here")).toBeNull();
  });
});
