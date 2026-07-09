import { describe, it, expect } from "vitest";
import { classifyFieldEdit, classifyVariantEdit, buildEditPrompt } from "./pending";
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

describe("gated-run prompt", () => {
  it("phrases a content edit as changing the visible text", () => {
    const prompt = buildEditPrompt(null, null, [
      { key: "content", label: "Text", kind: "style", value: "New label", token: null, shared: false, cssProps: [] },
    ]);
    expect(prompt).toContain("Change the element's visible text to `New label`.");
  });

  it("names the component file and lists the structural edits", () => {
    const prompt = buildEditPrompt("src/components/Button.tsx", "Button", [
      classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1),
      classifyVariantEdit("size", "large"),
    ]);
    expect(prompt).toContain("src/components/Button.tsx");
    expect(prompt).toContain("Button");
    expect(prompt).toContain("Set opacity to `0.5`.");
    expect(prompt).toContain("Change the `size` variant to `large`.");
    expect(prompt).toContain("preserve existing design-token usage");
  });
});
