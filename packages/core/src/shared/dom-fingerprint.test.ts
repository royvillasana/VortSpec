import { describe, it, expect } from "vitest";
import { fingerprint, segToken, classSignature, type FpSeg } from "./dom-fingerprint";

/** A path from a stable ancestor down to a Button inside a Card in the Header. */
const path = (): FpSeg[] => [
  { tag: "header", id: "app-header", nth: 1 },
  { tag: "div", component: "Card", classSig: "card", nth: 2 },
  { tag: "button", role: "button", classSig: "btn.primary", nth: 1 },
];

describe("fingerprint", () => {
  it("is stable across a re-render that reproduces the same structure", () => {
    // Simulate HMR replacing the element objects but rebuilding the same DOM shape.
    const before = fingerprint(path());
    const after = fingerprint(path()); // fresh segs, identical structure
    expect(after).toBe(before);
  });

  it("changes when the element's structural position changes", () => {
    const moved = path();
    moved[2] = { ...moved[2], nth: 3 }; // the button is now the 3rd of its type
    expect(fingerprint(moved)).not.toBe(fingerprint(path()));
  });

  it("changes when an identity attribute changes (tag / component / id)", () => {
    const p = path();
    expect(fingerprint([{ ...p[0], id: "other" }, p[1], p[2]])).not.toBe(fingerprint(path()));
    expect(fingerprint([p[0], { ...p[1], component: "Panel" }, p[2]])).not.toBe(fingerprint(path()));
  });

  it("distinguishes two same-tag siblings by nth-of-type", () => {
    const a: FpSeg = { tag: "li", classSig: "row", nth: 1 };
    const b: FpSeg = { tag: "li", classSig: "row", nth: 2 };
    expect(fingerprint([a])).not.toBe(fingerprint([b]));
  });

  it("emits a deterministic, attribute-order-stable token", () => {
    expect(segToken({ tag: "button", id: "x", component: "Button", role: "button", classSig: "btn", nth: 2 })).toBe(
      "button#x@Button[button].btn:2",
    );
  });
});

describe("classSignature", () => {
  it("drops framework hash classes, sorts, and caps", () => {
    expect(classSignature(["btn", "primary", "css-1a2b3c4", "sc-a1b2c3d"])).toBe("btn.primary");
  });
  it("is order-independent (sorted)", () => {
    expect(classSignature(["b", "a"])).toBe(classSignature(["a", "b"]));
  });
});
