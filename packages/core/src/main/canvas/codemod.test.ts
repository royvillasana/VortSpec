import { describe, expect, it } from "vitest";
import {
  checkResolvability,
  setJsxAttr,
  setClassName,
  setCvaVariant,
  setInlineStyle,
  setTextNode,
  insertComponent,
  deleteNode,
  duplicateNode,
  moveNode,
  moveNodeRelative,
  removeArrayItem,
  reorderArrayItem,
  listItems,
  matchBySignature,
  resolveEditAnchor,
  type Anchor,
} from "./codemod";

/** Locate the anchor (1-based line, 0-based column) of the `<` for a given tag occurrence. */
function anchorAt(text: string, needle: string): Anchor {
  const idx = text.indexOf(needle);
  if (idx < 0) throw new Error(`needle not found: ${needle}`);
  const before = text.slice(0, idx);
  const line = before.split("\n").length;
  const column = idx - (before.lastIndexOf("\n") + 1);
  return { line, column };
}

const CARD = `import { Button } from "@/components/ui/Button";

export function Card() {
  return (
    <div className="card">
      <h2 className="title">Hello</h2>
      <Button variant="primary" size="md">Save</Button>
    </div>
  );
}
`;

describe("checkResolvability", () => {
  it("marks a direct JSX child resolvable", () => {
    expect(checkResolvability(CARD, anchorAt(CARD, "<Button")).resolvable).toBe(true);
    expect(checkResolvability(CARD, anchorAt(CARD, "<h2")).resolvable).toBe(true);
  });

  it("marks an element inside a .map() un-resolvable", () => {
    const src = `export function List({ items }) {
  return <ul>{items.map((it) => <li className="row">{it}</li>)}</ul>;
}`;
    const r = checkResolvability(src, anchorAt(src, "<li"));
    expect(r.resolvable).toBe(false);
    expect(r.reason).toMatch(/list|map/i);
  });

  it("marks an element inside a ternary un-resolvable", () => {
    const src = `export function C({ on }) {
  return <div>{on ? <span className="x">A</span> : null}</div>;
}`;
    expect(checkResolvability(src, anchorAt(src, "<span")).resolvable).toBe(false);
  });

  it("marks an element inside an && short-circuit un-resolvable", () => {
    const src = `export function C({ on }) {
  return <div>{on && <span className="x">A</span>}</div>;
}`;
    expect(checkResolvability(src, anchorAt(src, "<span")).resolvable).toBe(false);
  });
});

describe("field codemods", () => {
  it("replaces an existing attribute", () => {
    const out = setJsxAttr(CARD, anchorAt(CARD, "<Button"), "variant", { kind: "string", value: "secondary" });
    expect(out).toContain('variant="secondary"');
    expect(out).not.toContain('variant="primary"');
  });

  it("adds a new attribute when absent", () => {
    const out = setJsxAttr(CARD, anchorAt(CARD, "<Button"), "disabled", { kind: "expression", value: "true" });
    expect(out).toContain("disabled={true}");
  });

  it("setClassName rewrites className", () => {
    const out = setClassName(CARD, anchorAt(CARD, "<h2"), "title title--lg");
    expect(out).toContain('className="title title--lg"');
  });

  it("setCvaVariant sets a variant prop", () => {
    const out = setCvaVariant(CARD, anchorAt(CARD, "<Button"), "size", "lg");
    expect(out).toContain('size="lg"');
  });

  it("is idempotent — writing the same value twice yields the same source", () => {
    const once = setJsxAttr(CARD, anchorAt(CARD, "<Button"), "variant", { kind: "string", value: "ghost" });
    const twice = setJsxAttr(once, anchorAt(once, "<Button"), "variant", { kind: "string", value: "ghost" });
    expect(twice).toBe(once);
  });

  it("setTextNode replaces leaf text", () => {
    const out = setTextNode(CARD, anchorAt(CARD, "<h2"), "Welcome");
    expect(out).toContain(">Welcome</h2>");
    expect(out).not.toContain(">Hello<");
  });

  it("setTextNode refuses an element with child elements", () => {
    expect(() => setTextNode(CARD, anchorAt(CARD, "<div"), "nope")).toThrow();
  });
});

describe("setInlineStyle — freeform style → inline style object", () => {
  it("adds a style attribute when the element has none (camelCases the CSS prop)", () => {
    const out = setInlineStyle(CARD, anchorAt(CARD, "<h2"), { color: "#c53434", "background-color": "#fff" });
    expect(out).toContain('style={{ color: "#c53434", backgroundColor: "#fff" }}');
    // className is preserved.
    expect(out).toContain('<h2 className="title"');
  });

  it("merges into an existing inline style object (updates a prop, adds a new one)", () => {
    const src = `export function C() {
  return <p style={{ color: "red", fontSize: "12px" }}>Hi</p>;
}`;
    const out = setInlineStyle(src, anchorAt(src, "<p"), { color: "#00f", "border-radius": "8px" });
    expect(out).toContain('color: "#00f"'); // updated in place
    expect(out).toContain('fontSize: "12px"'); // untouched
    expect(out).toContain('borderRadius: "8px"'); // added
  });

  it("quotes a CSS custom-property key", () => {
    const out = setInlineStyle(CARD, anchorAt(CARD, "<h2"), { "--brand": "#c53434" });
    expect(out).toContain('"--brand": "#c53434"');
  });

  it("withholds (throws) when style is a non-object expression it can't safely merge", () => {
    const src = `export function C({ s }) { return <p style={s}>Hi</p>; }`;
    expect(() => setInlineStyle(src, anchorAt(src, "<p"), { color: "#000" })).toThrow();
  });
});

describe("moveNodeRelative — drag-drop reorder", () => {
  it("moves an element to BEFORE a sibling anchor", () => {
    const out = moveNodeRelative(CARD, anchorAt(CARD, "<Button"), anchorAt(CARD, "<h2"), "before");
    // Button now precedes the h2.
    expect(out.indexOf("<Button")).toBeLessThan(out.indexOf("<h2"));
    // No duplication and no loss.
    expect(out.match(/<Button/g)).toHaveLength(1);
    expect(out).toContain('<h2 className="title">Hello</h2>');
  });

  it("moves an element to AFTER a sibling anchor", () => {
    const out = moveNodeRelative(CARD, anchorAt(CARD, "<h2"), anchorAt(CARD, "<Button"), "after");
    expect(out.indexOf("<Button")).toBeLessThan(out.indexOf("<h2"));
    expect(out.match(/<h2/g)).toHaveLength(1);
  });

  it("refuses to move an element into itself", () => {
    expect(() => moveNodeRelative(CARD, anchorAt(CARD, "<div"), anchorAt(CARD, "<h2"), "after")).toThrow();
  });
});

describe("resolveEditAnchor — verify/re-locate by identity (DR-2)", () => {
  it("keeps the raw anchor when the element there matches the expected identity", () => {
    const a = anchorAt(CARD, "<h2");
    expect(resolveEditAnchor(CARD, a, { tag: "h2", className: "title" })).toEqual(a);
  });
  it("re-locates when the anchor is STALE (points at the wrong element)", () => {
    // Anchor at <div>, but we expect the h2.title → re-locate to the h2's real anchor.
    const stale = anchorAt(CARD, "<div");
    expect(resolveEditAnchor(CARD, stale, { tag: "h2", className: "title" })).toEqual(anchorAt(CARD, "<h2"));
  });
  it("returns null when a stale anchor can't be uniquely re-located", () => {
    const src = `export function C(){return <div><span className="t">a</span><span className="t">b</span></div>;}`;
    const stale = anchorAt(src, "<div");
    expect(resolveEditAnchor(src, stale, { tag: "span", className: "t" })).toBeNull();
  });
  it("passes through when there's nothing to verify against", () => {
    const a = anchorAt(CARD, "<h2");
    expect(resolveEditAnchor(CARD, a, undefined)).toEqual(a);
    expect(resolveEditAnchor(CARD, a, {})).toEqual(a);
  });
});

describe("matchBySignature — low-confidence fallback agrees with the anchor (task 1.4)", () => {
  it("resolves the SAME anchor the high-confidence path (data-source / jsxAt) uses", () => {
    // For each element, the class-signature match must equal the true anchor of its `<`.
    for (const [tag, cls] of [["h2", "title"], ["Button", undefined] as const, ["div", "card"]] as const) {
      const matched = matchBySignature(CARD, { tag, className: cls });
      expect(matched).toEqual(anchorAt(CARD, `<${tag}`));
      // …and both resolve to the same element (writing via the matched anchor hits it).
      const out = setJsxAttr(CARD, matched!, "data-x", { kind: "string", value: "1" });
      expect(out).toContain(`<${tag}`);
    }
  });

  it("returns null when the signature is ambiguous (2+ matches → hand off, never guess)", () => {
    const src = `export function C() {
  return (<div><span className="tag">a</span><span className="tag">b</span></div>);
}`;
    expect(matchBySignature(src, { tag: "span", className: "tag" })).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(matchBySignature(CARD, { tag: "section" })).toBeNull();
    expect(matchBySignature(CARD, { tag: "h2", className: "nope" })).toBeNull();
  });
});

describe("list-data codemods — reorder/remove a mapped element's backing local array", () => {
  const LIST = `const items = ["Alpha", "Beta", "Gamma"];
export function App() {
  return (
    <ul className="list">
      {items.map((it) => (
        <li className="row" key={it}>{it}</li>
      ))}
    </ul>
  );
}`;
  const INLINE = `export function App() {
  return <ul>{["A", "B", "C"].map((x) => <li key={x}>{x}</li>)}</ul>;
}`;

  it("resolves the backing array items from a mapped element", () => {
    expect(listItems(LIST, anchorAt(LIST, "<li"))).toEqual(['"Alpha"', '"Beta"', '"Gamma"']);
    expect(listItems(INLINE, anchorAt(INLINE, "<li"))).toEqual(['"A"', '"B"', '"C"']);
  });

  it("removes a list item by index (const array)", () => {
    const out = removeArrayItem(LIST, anchorAt(LIST, "<li"), 1); // remove Beta
    expect(out).toContain('const items = ["Alpha", "Gamma"];');
  });

  it("reorders a list item (move index 2 → 0)", () => {
    const out = reorderArrayItem(LIST, anchorAt(LIST, "<li"), 2, 0); // Gamma to front
    expect(out).toContain('const items = ["Gamma", "Alpha", "Beta"];');
  });

  it("edits an INLINE array literal too", () => {
    const out = removeArrayItem(INLINE, anchorAt(INLINE, "<li"), 0);
    expect(out).toContain('["B", "C"].map');
  });

  it("withholds (throws) when the list isn't a local array (props/import/state)", () => {
    const src = `export function App({ items }) {
  return <ul>{items.map((it) => <li key={it}>{it}</li>)}</ul>;
}`;
    expect(() => removeArrayItem(src, anchorAt(src, "<li"), 0)).toThrow(/local array/);
  });
});

describe("structural codemods", () => {
  it("insertComponent adds a child + ensures the import", () => {
    const out = insertComponent(CARD, anchorAt(CARD, "<div"), { name: "Badge", importFrom: "@/components/ui/Badge" });
    expect(out).toContain("<Badge />");
    expect(out).toContain('import { Badge } from "@/components/ui/Badge"');
  });

  it("insertComponent reuses an existing import declaration", () => {
    const out = insertComponent(CARD, anchorAt(CARD, "<div"), { name: "Icon", importFrom: "@/components/ui/Button" });
    // added to the SAME import line, not a duplicate module import
    expect(out.match(/from "@\/components\/ui\/Button"/g)?.length).toBe(1);
    expect(out).toContain("Icon");
  });

  it("deleteNode removes the element", () => {
    const out = deleteNode(CARD, anchorAt(CARD, "<Button"));
    expect(out).not.toContain("<Button");
    expect(out).toContain('<h2 className="title">'); // siblings untouched
  });

  it("duplicateNode inserts a copy after the original", () => {
    const out = duplicateNode(CARD, anchorAt(CARD, "<Button"));
    expect(out.match(/<Button /g)?.length).toBe(2);
  });

  it("moveNode reparents an element into another container", () => {
    const src = `export function C() {
  return (
    <section>
      <header className="hdr"></header>
      <button className="cta">Go</button>
    </section>
  );
}`;
    const out = moveNode(src, anchorAt(src, "<button"), anchorAt(src, "<header"));
    // the button now lives inside <header>…</header>
    expect(out).toMatch(/<header[^>]*>[\s\S]*<button[^>]*>Go<\/button>[\s\S]*<\/header>/);
  });
});
