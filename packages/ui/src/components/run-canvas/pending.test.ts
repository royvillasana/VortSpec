import { describe, it, expect } from "vitest";
import {
  classifyFieldEdit,
  classifyVariantEdit,
  buildEditPrompt,
  groupEditsByElement,
  editProvenance,
  describeEdit,
  isTokenBinding,
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
  const text: PendingEdit = { key: "content", id: "content", label: "Text", kind: "style", value: "Hi", token: null, shared: false, cssProps: [] };
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

describe("isTokenBinding — a var() binding is a source edit, not a token-value rewrite", () => {
  it("is true for a var(--name) token edit (routes to the gated source run)", () => {
    const bind = classifyFieldEdit(
      selection,
      "radius",
      "var(--radius-md)",
      ["border-radius"],
      () => 5,
      false,
      undefined,
      "radius-md", // tokenOverride: the bound token name
    );
    expect(bind.kind).toBe("token");
    expect(isTokenBinding(bind)).toBe(true); // must NOT go to setTokenValue (would write --radius-md: var(--radius-md))
  });

  it("is false for a concrete token-value edit (commits to the token file)", () => {
    const valueEdit = classifyFieldEdit(selection, "radius", "12px", ["border-radius"], () => 5);
    expect(valueEdit.kind).toBe("token");
    expect(isTokenBinding(valueEdit)).toBe(false);
  });

  it("is false for a plain style edit", () => {
    expect(isTokenBinding(classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1))).toBe(false);
  });
});

describe("gated-run prompt", () => {
  it("phrases a content edit as an exact visible-text change", () => {
    const prompt = buildEditPrompt([
      {
        file: null,
        component: null,
        label: "the element",
        text: null,
        edits: [{ key: "content", id: "content", label: "Text", kind: "style", value: "New label", token: null, shared: false, cssProps: [] }],
      },
    ]);
    expect(prompt).toContain("Set the element's visible text to `New label` (exact).");
  });

  it("names the component file; variant edits read as exact, freeform as approximate", () => {
    const prompt = buildEditPrompt([
      {
        file: "src/components/Button.tsx",
        component: "Button",
        label: "Button",
        text: null,
        edits: [classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1), classifyVariantEdit("size", "large")],
      },
    ]);
    expect(prompt).toContain("src/components/Button.tsx");
    expect(prompt).toContain("Button");
    expect(prompt).toContain("Approximate visual target — set opacity to about `0.5`");
    expect(prompt).toContain("Set the `size` variant to `large` (exact");
    expect(prompt).toContain("preserve existing design-token usage");
  });

  it("groups edits per element when they span more than one (multi-element apply)", () => {
    const prompt = buildEditPrompt([
      { file: "src/App.tsx", component: null, label: "Card", text: "Featured", edits: [classifyFieldEdit(selection, "opacity", "0.5", ["opacity"], () => 1)] },
      { file: "src/App.tsx", component: null, label: "Sidebar", text: "Filters", edits: [classifyFieldEdit(selection, "radius", "12px", ["border-radius"], () => 1)] },
    ]);
    expect(prompt).toContain("span 2 elements");
    expect(prompt).toContain('On the "Card" element whose leading text is "Featured"');
    expect(prompt).toContain('On the "Sidebar" element whose leading text is "Filters"');
  });
});

describe("groupEditsByElement", () => {
  it("keeps the same property on two elements as distinct groups", () => {
    const a = { ...classifyFieldEdit(selection, "opacity", "0.4", ["opacity"], () => 1), fingerprint: "fp-a", nodeId: "n1", file: "src/A.tsx", elementLabel: "Card", elementText: "A" };
    const b = { ...classifyFieldEdit(selection, "opacity", "0.9", ["opacity"], () => 1), fingerprint: "fp-b", nodeId: "n2", file: "src/A.tsx", elementLabel: "Row", elementText: "B" };
    const groups = groupEditsByElement([a, b]);
    expect(groups).toHaveLength(2);
    expect(groups[0].edits[0].value).toBe("0.4");
    expect(groups[1].edits[0].value).toBe("0.9");
  });
});
