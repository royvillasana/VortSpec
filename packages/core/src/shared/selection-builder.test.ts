import { describe, it, expect } from "vitest";
import { buildSelection, alignToCss, flowToCss } from "./selection-builder";
import type { NodeReadout } from "./inspector-bridge";
import type { InspectorToken } from "./inspector";

function readout(over: Partial<NodeReadout> = {}): NodeReadout {
  return {
    nodeId: "n1",
    rect: { x: 1362, y: 30, width: 108, height: 38 },
    computed: {
      display: "inline-flex",
      "flex-direction": "row",
      gap: "8px",
      "padding-left": "12px",
      "padding-top": "6px",
      width: "108px",
      height: "38px",
      "border-top-left-radius": "8px",
      "border-top-width": "1px",
      "border-top-color": "rgb(37, 99, 235)",
      "border-top-style": "solid",
      "background-color": "rgb(255, 255, 255)",
      color: "rgb(17, 24, 39)",
      opacity: "1",
      "box-shadow": "none",
      filter: "none",
      transform: "none",
      "mix-blend-mode": "normal",
      ...(over.computed ?? {}),
    },
    customProps: over.customProps ?? {},
    fingerprint: over.fingerprint ?? "fp",
    dataComponent: over.dataComponent ?? "button",
    componentCandidates: over.componentCandidates ?? [],
    parentFlow: over.parentFlow ?? "block",
    parentSize: over.parentSize ?? null,
    className: over.className ?? "btn",
    children: over.children ?? [],
    text: over.text,
    ...(over.rect ? { rect: over.rect } : {}),
  };
}

const tokens: InspectorToken[] = [
  { name: "space-2", type: "spacing", rawValue: "8px", resolvedValue: "8px", source: "generated-code", uses: 3 },
  { name: "radius-md", type: "radius", rawValue: "8px", resolvedValue: "8px", source: "generated-code", uses: 5 },
  { name: "color-border", type: "color", rawValue: "#2563eb", resolvedValue: "rgb(37, 99, 235)", source: "figma-variable", uses: 2 },
];

describe("buildSelection", () => {
  it("groups computed style into Figma sections in order", () => {
    const sel = buildSelection(readout(), { tag: "button" });
    const ids = sel.sections.map((s) => s.id);
    // Order is preserved; empty sections (layoutGuide) are dropped.
    expect(ids).toEqual(["position", "size", "layout", "appearance", "stroke", "fill", "colors"]);
  });

  it("binds values to their owning tokens", () => {
    const sel = buildSelection(readout(), { tokens, tag: "button" });
    const layout = sel.sections.find((s) => s.id === "layout")!;
    const gap = layout.fields.find((f) => f.key === "gap")!;
    expect(gap.token).toBe("space-2");
    const radius = sel.sections.find((s) => s.id === "appearance")!.fields.find((f) => f.key === "radius")!;
    expect(radius.token).toBe("radius-md");
    const strokeColor = sel.sections.find((s) => s.id === "stroke")!.fields.find((f) => f.key === "stroke-color")!;
    expect(strokeColor.token).toBe("color-border");
  });

  it("exposes Width/Height as Fixed/Hug/Fill resize fields, with the mode read from computed", () => {
    // A fixed px width in a row parent → Fixed; auto height with no stretch → Hug.
    const sel = buildSelection(readout({ computed: { width: "240px", height: "auto" }, parentFlow: "row" }), { tag: "div" });
    const size = sel.sections.find((s) => s.id === "size")!;
    const w = size.fields.find((f) => f.key === "width")!;
    const h = size.fields.find((f) => f.key === "height")!;
    expect(w.kind).toBe("resize");
    expect(w.mode).toBe("fixed");
    expect(w.value).toBe("240px");
    expect(h.mode).toBe("hug");
    expect(h.value).toBe("Hug");
  });

  it("reads Fill from a flex-grown main-axis width", () => {
    const sel = buildSelection(readout({ computed: { width: "auto", "flex-grow": "1" }, parentFlow: "row" }), { tag: "div" });
    const w = sel.sections.find((s) => s.id === "size")!.fields.find((f) => f.key === "width")!;
    expect(w.mode).toBe("fill");
    expect(w.value).toBe("Fill");
  });

  it("makes margins token-bindable to the spacing scale (Phase 5)", () => {
    const sel = buildSelection(readout({ computed: { "margin-left": "8px", "margin-top": "8px" } }), {
      tokens,
      tag: "div",
    });
    const marginX = sel.sections.find((s) => s.id === "layout")!.fields.find((f) => f.key === "margin-left")!;
    expect(marginX.kind).toBe("length");
    expect(marginX.tokenType).toBe("spacing");
    expect(marginX.token).toBe("space-2"); // 8px recognized as the spacing token
  });

  it("falls back to an in-scope custom-property name when no project token matches", () => {
    const sel = buildSelection(readout({ customProps: { "--brand-gap": "8px" } }), { tag: "button" });
    const gap = sel.sections.find((s) => s.id === "layout")!.fields.find((f) => f.key === "gap")!;
    expect(gap.token).toBe("brand-gap");
  });

  it("hides sections with no applicable values (transparent fill, no stroke)", () => {
    const sel = buildSelection(
      readout({ computed: { "border-top-width": "0px", "background-color": "rgba(0, 0, 0, 0)" } }),
      { tag: "div" },
    );
    const ids = sel.sections.map((s) => s.id);
    expect(ids).not.toContain("stroke");
    expect(ids).not.toContain("fill");
  });

  it("uses the component name and variants when bound", () => {
    const sel = buildSelection(readout(), {
      component: {
        name: "Button",
        file: "src/components/Button.tsx",
        variants: [
          { key: "size", kind: "enum", options: ["small", "medium", "large"], current: "medium", classes: {} },
        ],
      },
      tag: "button",
    });
    expect(sel.label).toBe("Button");
    expect(sel.component).toBe("Button");
    expect(sel.variants[0].current).toBe("medium");
  });

  it("derives rotation from a transform matrix", () => {
    const sel = buildSelection(readout({ computed: { transform: "matrix(0, 1, -1, 0, 0, 0)" } }), { tag: "div" });
    const rot = sel.sections.find((s) => s.id === "position")!.fields.find((f) => f.key === "rotation")!;
    expect(rot.value).toBe("90");
  });

  it("detects the current variant from the element's classes", () => {
    const sel = buildSelection(readout({ className: "btn bg-teal-500 text-white" }), {
      component: {
        name: "Button",
        file: "src/components/Button.tsx",
        variants: [
          {
            key: "variant",
            kind: "enum",
            options: ["primary", "secondary"],
            defaultValue: "primary",
            classes: { primary: "bg-blue-500 text-white", secondary: "bg-teal-500 text-white" },
          },
        ],
      },
      tag: "button",
    });
    // Matches the "secondary" classes, not the "primary" default.
    expect(sel.variants[0].current).toBe("secondary");
  });

  it("adds a Content section for a text-leaf element", () => {
    const sel = buildSelection(readout({ text: "Click me" }), { tag: "button" });
    const content = sel.sections.find((s) => s.id === "content")!;
    expect(content.fields[0]).toMatchObject({ key: "content", kind: "text", value: "Click me" });
  });

  it("has no Content section when the element has no text", () => {
    const sel = buildSelection(readout(), { tag: "div" });
    expect(sel.sections.find((s) => s.id === "content")).toBeUndefined();
  });

  it("always exposes a Size section with width and height", () => {
    const sel = buildSelection(readout(), { tag: "button" });
    const size = sel.sections.find((s) => s.id === "size")!;
    expect(size.fields.map((f) => f.key)).toEqual(["width", "height"]);
    expect(size.fields[0].value).toBe("108px");
  });

  it("adds a Figma alignment control for flex containers only", () => {
    const flex = buildSelection(readout(), { tag: "div" }); // readout is inline-flex row
    const align = flex.sections.find((s) => s.id === "layout")!.fields.find((f) => f.key === "align");
    expect(align?.kind).toBe("align");
    const block = buildSelection(readout({ computed: { display: "block" } }), { tag: "div" });
    expect(block.sections.find((s) => s.id === "layout")!.fields.find((f) => f.key === "align")).toBeUndefined();
  });
});

describe("alignToCss", () => {
  it("maps X→justify / Y→align for a row container", () => {
    expect(alignToCss("end|center", "row")).toEqual({ "justify-content": "flex-end", "align-items": "center" });
  });

  it("swaps the axes for a column container", () => {
    expect(alignToCss("end|center", "column")).toEqual({ "justify-content": "center", "align-items": "flex-end" });
  });
});

describe("flowToCss", () => {
  it("maps the flow segments to display / flex-direction", () => {
    expect(flowToCss("block")).toEqual({ display: "block" });
    expect(flowToCss("row")).toEqual({ display: "flex", "flex-direction": "row" });
    expect(flowToCss("column")).toEqual({ display: "flex", "flex-direction": "column" });
  });
});

describe("layout section controls", () => {
  it("flow is a segmented control and margins are always present", () => {
    const sel = buildSelection(readout({ computed: { "margin-left": "0px", "margin-top": "12px" } }));
    const layout = sel.sections.find((s) => s.id === "layout")!;
    const flow = layout.fields.find((f) => f.key === "flow")!;
    expect(flow.kind).toBe("segment");
    expect(flow.options).toEqual(["block", "row", "column"]);
    expect(layout.fields.find((f) => f.key === "margin-left")?.value).toBe("0px");
    expect(layout.fields.find((f) => f.key === "margin-top")?.value).toBe("12px");
  });
});
