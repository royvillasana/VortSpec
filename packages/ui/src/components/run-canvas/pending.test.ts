import { describe, it, expect } from "vitest";
import {
  classifyFieldEdit,
  classifyVariantEdit,
  buildEditPrompt,
  editProvenance,
  describeEdit,
  type PendingEdit,
} from "./pending";
import type { Selection } from "@vortspec/core/ipc";

const selection: Selection = {
  nodeId: "n1",
  label: "Button",
  component: "Button",
  file: "src/components/Button.tsx",
  resembles: null,
  rect: { x: 0, y: 0, width: 108, height: 38 },
  variants: [],
  sections: [
    {
      id: "appearance",
      title: "Appearance",
      fields: [
        { key: "radius", label: "Radius", kind: "length", value: "8px", token: "radius-md", options: [] },
        { key: "opacity", label: "Opacity", kind: "number", value: "1", token: null, options: [] },
      ],
    },
  ],
};

describe("pending-edit classification", () => {
  it("classifies a token-backed field as a token edit and flags shared usage", () => {
    const edit = classifyFieldEdit(selection, "radius", "12px", ["border-radius"], () => 5);
    expect(edit.kind).toBe("token");
    expect(edit.token).toBe("radius-md");
    expect(edit.shared).toBe(true); // 5 uses → shared
    expect(edit.value).toBe("12px");
  });

  it("classifies a non-token field as a source (style) edit", () => {
    const edit = classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1);
    expect(edit.kind).toBe("style");
    expect(edit.token).toBeNull();
    expect(edit.shared).toBe(false);
    expect(edit.cssProps).toEqual(["opacity"]);
  });

  it("a token used once is not marked shared", () => {
    const edit = classifyFieldEdit(selection, "radius", "12px", ["border-radius"], () => 1);
    expect(edit.shared).toBe(false);
  });

  it("classifies a variant switch", () => {
    const edit = classifyVariantEdit("size", "large");
    expect(edit).toMatchObject({ key: "variant:size", kind: "variant", value: "large" });
  });
});

describe("edit provenance (Phase 6)", () => {
  const text: PendingEdit = { key: "content", label: "Text", kind: "style", value: "Hi", token: null, shared: false, cssProps: [] };
  const token = classifyFieldEdit(selection, "radius", "12px", ["border-radius"], () => 5);
  const variant = classifyVariantEdit("size", "large");
  const freeform = classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1);

  it("classifies each edit's provenance", () => {
    expect(editProvenance(variant)).toBe("variant");
    expect(editProvenance(token)).toBe("token");
    expect(editProvenance(text)).toBe("text");
    expect(editProvenance(freeform)).toBe("freeform-style");
  });

  it("describes deterministic edits exactly and freeform edits as approximate", () => {
    expect(describeEdit(variant)).toContain("Set the `size` variant to `large` (exact");
    expect(describeEdit(token)).toContain("design token `--radius-md` (exact");
    expect(describeEdit(text)).toContain("visible text to `Hi` (exact)");
    const ff = describeEdit(freeform);
    expect(ff).toContain("Approximate visual target");
    expect(ff).toContain("opacity");
  });
});

describe("gated-run prompt", () => {
  it("phrases a content edit as an exact visible-text change", () => {
    const prompt = buildEditPrompt(null, null, [
      { key: "content", label: "Text", kind: "style", value: "New label", token: null, shared: false, cssProps: [] },
    ]);
    expect(prompt).toContain("Set the element's visible text to `New label` (exact).");
  });

  it("names the component file; variant edits read as exact, freeform as approximate", () => {
    const prompt = buildEditPrompt("src/components/Button.tsx", "Button", [
      classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1),
      classifyVariantEdit("size", "large"),
    ]);
    expect(prompt).toContain("src/components/Button.tsx");
    expect(prompt).toContain("Button");
    expect(prompt).toContain("Approximate visual target — set opacity to about `0.5`");
    expect(prompt).toContain("Set the `size` variant to `large` (exact");
    expect(prompt).toContain("preserve existing design-token usage");
  });
});
