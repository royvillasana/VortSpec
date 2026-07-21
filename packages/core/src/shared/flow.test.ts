import { describe, it, expect } from "vitest";
import { detectedComponentsSchema } from "./flow";

describe("detectedComponentsSchema — accepts a flat array OR the wrapper object", () => {
  const entry = { name: "button", level: "atom" as const, variants: ["type"] };

  it("parses a flat top-level array (the classic form)", () => {
    const r = detectedComponentsSchema.safeParse([entry]);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toHaveLength(1);
  });

  it("unwraps a rich metadata object `{ …, components: [...] }` (the extract-skill form)", () => {
    // Regression: this wrapper was reported as "zero components detected" even though the
    // components array was present, because the schema only accepted a flat array.
    const wrapper = {
      source: "figma",
      complete: true,
      totals: { publicComponents: 2 },
      notes: "…",
      components: [entry, { name: "alert", level: "molecule", nodeId: "1:2", componentKey: "abc" }],
    };
    const r = detectedComponentsSchema.safeParse(wrapper);
    expect(r.success).toBe(true);
    expect(r.success && r.data.map((c) => c.name)).toEqual(["button", "alert"]);
  });

  it("keeps the node reference whether it's `figmaNodeId` or `nodeId`", () => {
    const r = detectedComponentsSchema.safeParse([
      { name: "a", figmaNodeId: "1:1" },
      { name: "b", nodeId: "2:2", componentKey: "k" },
    ]);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data[0].figmaNodeId).toBe("1:1");
      expect(r.data[1].nodeId).toBe("2:2");
    }
  });
});
