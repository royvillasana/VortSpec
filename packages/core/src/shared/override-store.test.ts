import { describe, it, expect } from "vitest";
import {
  emptyStyleOverride,
  mergeStyle,
  restorePlan,
  emptyClassOverride,
  mergeClass,
} from "./override-store";

describe("mergeStyle", () => {
  it("records applied props and captures the prior inline value once", () => {
    const o = emptyStyleOverride();
    mergeStyle(o, { color: "red" }, () => ""); // color was unset
    expect(o.applied).toEqual({ color: "red" });
    expect(o.original).toEqual({ color: "" });
  });

  it("does not overwrite the captured original when the same prop is re-edited", () => {
    const o = emptyStyleOverride();
    mergeStyle(o, { color: "red" }, (p) => (p === "color" ? "green" : "")); // original was green
    mergeStyle(o, { color: "blue" }, () => "SHOULD_NOT_BE_READ");
    expect(o.applied.color).toBe("blue");
    expect(o.original.color).toBe("green"); // still the true original
  });

  it("re-applies the same props after a simulated rebuild (kept by id, not element)", () => {
    // The store is keyed by the stable node id in the guest; a re-render that swaps
    // the element leaves `applied` intact, so the guest re-paints these exact props.
    const o = emptyStyleOverride();
    mergeStyle(o, { "margin-left": "8px", color: "red" }, () => "");
    // ...HMR re-render happens (element object replaced) — the override is untouched...
    expect(o.applied).toEqual({ "margin-left": "8px", color: "red" });
  });
});

describe("restorePlan", () => {
  it("sets back prior values and removes props that were unset", () => {
    const o = emptyStyleOverride();
    mergeStyle(o, { color: "red", "margin-left": "8px" }, (p) => (p === "color" ? "green" : ""));
    expect(restorePlan(o)).toEqual({ color: "green", "margin-left": null });
  });
});

describe("mergeClass", () => {
  it("tracks added and removed classes", () => {
    const c = mergeClass(emptyClassOverride(), ["old"], ["new"]);
    expect(c).toEqual({ add: ["new"], remove: ["old"] });
  });

  it("keeps add/remove mutually exclusive and ignores empty strings", () => {
    const c = emptyClassOverride();
    mergeClass(c, [], ["variant-a"]);
    mergeClass(c, ["variant-a"], ["variant-b"]); // now remove variant-a, add variant-b
    expect(c.add).toEqual(["variant-b"]);
    expect(c.remove).toEqual(["variant-a"]);
    mergeClass(c, [""], [""]); // no-op
    expect(c.add).toEqual(["variant-b"]);
  });

  it("does not duplicate a class re-added in the same direction", () => {
    const c = emptyClassOverride();
    mergeClass(c, [], ["x"]);
    mergeClass(c, [], ["x"]);
    expect(c.add).toEqual(["x"]);
  });
});
