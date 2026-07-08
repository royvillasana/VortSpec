import { describe, expect, it } from "vitest";
import {
  parseFilesJson,
  parseMode,
  dtcgToVariables,
  mapDtcgType,
  parseComponentsEval,
} from "./figma-cli";

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
