import { describe, it, expect } from "vitest";
import {
  resembleComponent,
  resolveComponent,
  matchTokenName,
  tokenNameFromVar,
  tokensForField,
  cssForField,
  buildSelectionContext,
} from "./compose";
import { classifyFieldEdit, classifyVariantEdit } from "./pending";
import type { InspectorComponent, Selection, BridgeNode } from "@vortspec/core/ipc";

describe("matchTokenName", () => {
  const tokens = [
    { name: "spacing-0", resolvedValue: "0px", type: "spacing" },
    { name: "spacing-4", resolvedValue: "16px", type: "spacing" },
    { name: "radius-md", resolvedValue: "16px", type: "radius" },
  ];
  it("matches a value to a token of the requested type", () => {
    expect(matchTokenName("16px", tokens, "spacing")).toBe("spacing-4");
    expect(matchTokenName("16px", tokens, "radius")).toBe("radius-md");
  });
  it("is null for a literal that matches no token (detach)", () => {
    expect(matchTokenName("15px", tokens, "spacing")).toBeNull();
  });
  it("normalizes whitespace/case before comparing", () => {
    expect(matchTokenName(" 0PX ", tokens, "spacing")).toBe("spacing-0");
  });
});

describe("tokensForField (filter by field type — Phase 5)", () => {
  const tokens = [
    { name: "space-4", resolvedValue: "16px", type: "spacing" },
    { name: "space-6", resolvedValue: "24px", type: "spacing" },
    { name: "radius-md", resolvedValue: "8px", type: "radius" },
    { name: "brand", resolvedValue: "#2563EB", type: "color" },
  ];
  it("returns only tokens whose type matches the field", () => {
    expect(tokensForField(tokens, "spacing").map((t) => t.name)).toEqual(["space-4", "space-6"]);
    expect(tokensForField(tokens, "radius").map((t) => t.name)).toEqual(["radius-md"]);
    expect(tokensForField(tokens, "color").map((t) => t.name)).toEqual(["brand"]);
  });
  it("returns nothing when the field has no token type", () => {
    expect(tokensForField(tokens, undefined)).toEqual([]);
  });
});

describe("tokenNameFromVar", () => {
  it("extracts the token name from a var() binding", () => {
    expect(tokenNameFromVar("var(--space-4)")).toBe("space-4");
    expect(tokenNameFromVar("var( --brand-primary )")).toBe("brand-primary");
  });
  it("is null for a raw literal", () => {
    expect(tokenNameFromVar("16px")).toBeNull();
    expect(tokenNameFromVar("#2563EB")).toBeNull();
  });
});

describe("cssForField emits var(--token) on a bound value (Phase 5)", () => {
  it("passes a var() binding through to every mapped property", () => {
    expect(cssForField("margin-left", "var(--space-4)")).toEqual({
      "margin-left": "var(--space-4)",
      "margin-right": "var(--space-4)",
    });
    expect(cssForField("radius", "var(--radius-md)")).toEqual({ "border-radius": "var(--radius-md)" });
  });
  it("still maps a raw literal", () => {
    expect(cssForField("gap", "16px")).toEqual({ gap: "16px" });
  });
});

const button: InspectorComponent = {
  name: "Button",
  level: "atom",
  file: "src/components/Button.tsx",
  props: [
    {
      key: "variant",
      kind: "enum",
      options: ["primary", "secondary"],
      classes: { primary: "bg-primary text-white", secondary: "bg-teal-500 text-white" },
    },
  ],
  tokens: [],
  status: "built",
  issues: [],
  specPath: null,
  reportPath: null,
};

describe("buildSelectionContext with provenance (Phase 6)", () => {
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
        fields: [{ key: "opacity", label: "Opacity", kind: "number", value: "1", token: null, options: [] }],
      },
    ],
  };

  it("appends nothing when there are no edits", () => {
    expect(buildSelectionContext(selection)).not.toContain("Canvas edits");
  });

  it("scopes a variant edit as exact and a freeform resize as approximate", () => {
    const variant = buildSelectionContext(selection, [classifyVariantEdit("size", "large")]);
    expect(variant).toContain("Canvas edits to apply:");
    expect(variant).toContain("Set the `size` variant to `large` (exact");

    const freeform = buildSelectionContext(selection, [
      classifyFieldEdit(selection, "opacity", "0.4", ["opacity"], () => 1),
    ]);
    expect(freeform).toContain("Approximate visual target");
    // The two edits produce visibly different, correctly-scoped context.
    expect(variant).not.toBe(freeform);
  });
});

describe("resembleComponent", () => {
  it("flags a raw element styled exactly like a variant", () => {
    expect(resembleComponent("flex bg-primary text-white p-2 rounded", [button])).toMatchObject({
      name: "Button",
      file: "src/components/Button.tsx",
    });
  });

  it("does not flag on a single generic utility", () => {
    expect(resembleComponent("text-white", [button])).toBeNull();
  });

  it("returns null when no variant class set is fully present", () => {
    expect(resembleComponent("grid gap-4 bg-primary", [button])).toBeNull(); // only 1 of primary's 2 classes
  });
});

describe("resolveComponent — recognition signals", () => {
  const div = (over: Partial<BridgeNode> = {}): BridgeNode =>
    ({ id: "n1", tag: "div", classes: [], childCount: 0, ...over }) as BridgeNode;

  it("recognizes via the data-component attribute", () => {
    expect(resolveComponent(div({ component: "Button" }), [button])?.name).toBe("Button");
  });

  it("recognizes a design-system component via React-fiber candidates (no data-component)", () => {
    // The DOM node is a bare <div> with no data-component, but the fiber says Button.
    expect(resolveComponent(div(), [button], ["Slot", "Button"])?.name).toBe("Button");
  });

  it("ignores fiber candidates that aren't project components (wrapper noise)", () => {
    expect(resolveComponent(div(), [button], ["Slot", "ForwardRef"])).toBeNull();
  });

  it("still recognizes a <button> tag as the Button component when nothing else matches", () => {
    expect(resolveComponent(div({ tag: "button" }), [button])?.name).toBe("Button");
  });

  it("returns null for genuine markup with no signal", () => {
    expect(resolveComponent(div(), [button], [])).toBeNull();
  });
});
