import { describe, it, expect } from "vitest";
import {
  runReportCore,
  parseTokenValue,
  cssPropertyToTokenType,
} from "../stages/report";
import { runStyleMiningCore } from "../stages/style-mining";
import { runStructureInferenceCore } from "../stages/structure-inference";
import { DesignTokenSchema, ComponentIRSchema } from "@vortspec/ir";
import type { StyleGroup } from "../stages/style-mining";

const MINIMAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="component-group">
    <button class="btn btn-primary">
      <span class="btn-label">Continue</span>
    </button>
    <button class="btn btn-secondary">
      <span class="btn-label">Cancel</span>
    </button>
  </div>
</body>
</html>`;

const MINIMAL_CSS = `.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-family: 'Geist', sans-serif;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #2563EB;
  color: #FFFFFF;
}

.btn-primary:hover {
  background-color: #1D4ED8;
}

.btn-secondary {
  background-color: transparent;
  color: #E7E9EC;
  border: 1px solid #34373D;
}

.btn-label {
  line-height: 1;
}`;

describe("cssPropertyToTokenType", () => {
  it("maps color properties to color", () => {
    expect(cssPropertyToTokenType("background-color")).toBe("color");
    expect(cssPropertyToTokenType("color")).toBe("color");
    expect(cssPropertyToTokenType("border-color")).toBe("color");
  });

  it("maps spacing properties", () => {
    expect(cssPropertyToTokenType("padding")).toBe("spacing");
    expect(cssPropertyToTokenType("margin")).toBe("spacing");
    expect(cssPropertyToTokenType("gap")).toBe("spacing");
    expect(cssPropertyToTokenType("width")).toBe("spacing");
  });

  it("maps border-radius to radius", () => {
    expect(cssPropertyToTokenType("border-radius")).toBe("radius");
  });

  it("maps opacity", () => {
    expect(cssPropertyToTokenType("opacity")).toBe("opacity");
  });

  it("returns null for unknown properties", () => {
    expect(cssPropertyToTokenType("cursor")).toBeNull();
    expect(cssPropertyToTokenType("transform")).toBeNull();
  });
});

describe("parseTokenValue", () => {
  it("parses hex colors (6 digit)", () => {
    const result = parseTokenValue("#2563EB", "color");
    expect(result).toEqual({ type: "color", value: { hex: "#2563EB" } });
  });

  it("parses hex colors (3 digit)", () => {
    const result = parseTokenValue("#FFF", "color");
    expect(result).toEqual({ type: "color", value: { hex: "#FFFFFF" } });
  });

  it("parses rgb colors", () => {
    const result = parseTokenValue("rgb(255, 0, 0)", "color");
    expect(result).toEqual({ type: "color", value: { hex: "#FF0000" } });
  });

  it("parses rgba colors", () => {
    const result = parseTokenValue("rgba(0, 128, 255, 0.5)", "color");
    expect(result).toEqual({ type: "color", value: { hex: "#0080FF" } });
  });

  it("parses px values for spacing", () => {
    const result = parseTokenValue("8px", "spacing");
    expect(result).toEqual({
      type: "spacing",
      value: { value: 8, unit: "px" },
    });
  });

  it("parses rem values for spacing", () => {
    const result = parseTokenValue("1.5rem", "spacing");
    expect(result).toEqual({
      type: "spacing",
      value: { value: 1.5, unit: "rem" },
    });
  });

  it("parses percentage values for spacing", () => {
    const result = parseTokenValue("100%", "spacing");
    expect(result).toEqual({
      type: "spacing",
      value: { value: 100, unit: "%" },
    });
  });

  it("parses px values for radius", () => {
    const result = parseTokenValue("8px", "radius");
    expect(result).toEqual({
      type: "radius",
      value: { value: 8, unit: "px" },
    });
  });

  it("parses opacity", () => {
    const result = parseTokenValue("0.5", "opacity");
    expect(result).toEqual({ type: "opacity", value: 0.5 });
  });

  it("parses z-index", () => {
    const result = parseTokenValue("100", "zIndex");
    expect(result).toEqual({ type: "zIndex", value: 100 });
  });

  it("returns null for unparseable values", () => {
    expect(parseTokenValue("auto", "spacing")).toBeNull();
    expect(parseTokenValue("none", "color")).toBeNull();
    expect(parseTokenValue("transparent", "color")).toBeNull();
  });
});

describe("Token promotion", () => {
  it("promotes style groups with usageCount >= 2", () => {
    const groups: StyleGroup[] = [
      {
        property: "background-color",
        value: "#2563EB",
        usageCount: 3,
        locations: ["a", "b", "c"],
      },
      {
        property: "color",
        value: "#FFFFFF",
        usageCount: 2,
        locations: ["a", "b"],
      },
      {
        property: "color",
        value: "#000000",
        usageCount: 1,
        locations: ["a"],
      },
    ];

    const result = runReportCore([], groups);
    // Only 2 groups have usageCount >= 2
    expect(result.tokens.length).toBe(2);
    expect(result.tokens.every((t) => t.type === "color")).toBe(true);
  });

  it("does not promote unparseable values", () => {
    const groups: StyleGroup[] = [
      {
        property: "background-color",
        value: "transparent",
        usageCount: 5,
        locations: ["a", "b", "c", "d", "e"],
      },
    ];

    const result = runReportCore([], groups);
    expect(result.tokens.length).toBe(0);
  });

  it("all produced tokens validate against DesignTokenSchema", () => {
    const groups: StyleGroup[] = [
      {
        property: "background-color",
        value: "#2563EB",
        usageCount: 3,
        locations: ["a", "b", "c"],
      },
      {
        property: "border-radius",
        value: "8px",
        usageCount: 4,
        locations: ["a", "b", "c", "d"],
      },
      {
        property: "opacity",
        value: "0.5",
        usageCount: 2,
        locations: ["a", "b"],
      },
    ];

    const result = runReportCore([], groups);
    for (const token of result.tokens) {
      const parsed = DesignTokenSchema.safeParse(token);
      if (!parsed.success) {
        console.error(
          "Token validation errors:",
          JSON.stringify(parsed.error.issues, null, 2),
        );
      }
      expect(parsed.success).toBe(true);
    }
  });
});

describe("Report -- full pipeline", () => {
  const files = [
    { path: "index.html", content: MINIMAL_HTML },
    { path: "styles.css", content: MINIMAL_CSS },
  ];
  const styleResult = runStyleMiningCore(files);
  const structureResult = runStructureInferenceCore(
    files,
    styleResult.groups,
  );

  it("produces tokens and updated components", () => {
    const result = runReportCore(
      structureResult.components,
      styleResult.groups,
    );
    expect(result.summary.componentCount).toBeGreaterThan(0);
  });

  it("sets component status to normalized", () => {
    const result = runReportCore(
      structureResult.components,
      styleResult.groups,
    );
    for (const comp of result.components) {
      expect(comp.status).toBe("normalized");
    }
  });

  it("components validate against ComponentIRSchema", () => {
    const result = runReportCore(
      structureResult.components,
      styleResult.groups,
    );
    for (const comp of result.components) {
      const parsed = ComponentIRSchema.safeParse(comp);
      if (!parsed.success) {
        console.error(
          "Component validation errors:",
          JSON.stringify(parsed.error.issues, null, 2),
        );
      }
      expect(parsed.success).toBe(true);
    }
  });

  it("tokens validate against DesignTokenSchema", () => {
    const result = runReportCore(
      structureResult.components,
      styleResult.groups,
    );
    for (const token of result.tokens) {
      const parsed = DesignTokenSchema.safeParse(token);
      if (!parsed.success) {
        console.error(
          "Token validation errors:",
          JSON.stringify(parsed.error.issues, null, 2),
        );
      }
      expect(parsed.success).toBe(true);
    }
  });

  it("generates completeness issues", () => {
    const result = runReportCore(
      structureResult.components,
      styleResult.groups,
    );
    for (const comp of result.components) {
      // Should have at least some issues (flagged literals, unconfirmed inferences)
      expect(comp.completeness.issues.length).toBeGreaterThan(0);
    }
  });

  it("completeness score is between 0 and 100", () => {
    const result = runReportCore(
      structureResult.components,
      styleResult.groups,
    );
    for (const comp of result.components) {
      expect(comp.completeness.score).toBeGreaterThanOrEqual(0);
      expect(comp.completeness.score).toBeLessThanOrEqual(100);
    }
  });
});
