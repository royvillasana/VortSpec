import { describe, expect, it } from "vitest";
import { editedDecls, fanOut, intersect, isSame, unwritten } from "./style-intersection";

/**
 * The test that earns its keep here is "Mixed is never flattened". Everything else in a bulk edit is
 * recoverable by looking at it; silently writing one member's value onto four others for a property the
 * user never touched is invisible at the moment it happens and expensive to find later.
 */

describe("reading a multi-selection", () => {
  it("shows a value every member agrees on", () => {
    const r = intersect([{ radius: "8px" }, { radius: "8px" }, { radius: "8px" }]);
    expect(r.radius).toEqual({ kind: "same", value: "8px" });
  });

  it("shows Mixed when they disagree", () => {
    const r = intersect([{ radius: "8px" }, { radius: "12px" }]);
    expect(r.radius).toEqual({ kind: "mixed" });
  });

  it("treats a property missing from one member as a difference, not agreement", () => {
    // Otherwise the shared value would be written onto an element that never had the property at all.
    const r = intersect([{ radius: "8px" }, {}]);
    expect(r.radius).toEqual({ kind: "mixed" });
  });

  it("reads a single member as itself", () => {
    const r = intersect([{ radius: "8px", padding: "4px" }]);
    expect(isSame(r.radius) && r.radius.value).toBe("8px");
    expect(isSame(r.padding) && r.padding.value).toBe("4px");
  });

  it("has nothing to say about an empty selection", () => {
    expect(intersect([])).toEqual({});
  });

  it("covers every property any member has", () => {
    const r = intersect([{ a: "1" }, { b: "2" }]);
    expect(Object.keys(r).sort()).toEqual(["a", "b"]);
    expect(r.a).toEqual({ kind: "mixed" });
    expect(r.b).toEqual({ kind: "mixed" });
  });
});

describe("writing a multi-selection", () => {
  it("writes only what the user touched", () => {
    const draft = { radius: "4px", padding: "12px", color: "#fff" };
    expect(editedDecls(draft, new Set(["padding"]))).toEqual({ padding: "12px" });
  });

  it("NEVER flattens a Mixed property the user left alone", () => {
    // Five elements with differing radii; the user edits padding only. Each must keep its own radius.
    const members = [
      { radius: "2px", padding: "1px" },
      { radius: "4px", padding: "1px" },
      { radius: "8px", padding: "1px" },
    ];
    const readout = intersect(members);
    expect(readout.radius).toEqual({ kind: "mixed" });

    const decls = editedDecls({ radius: "2px", padding: "12px" }, new Set(["padding"]));
    expect(decls).toEqual({ padding: "12px" });
    expect(decls).not.toHaveProperty("radius");
  });

  it("writes a touched field even when its value did not change", () => {
    // The user typed it. Declining to write would silently ignore an explicit instruction.
    expect(editedDecls({ radius: "8px" }, new Set(["radius"]))).toEqual({ radius: "8px" });
  });

  it("writes nothing when nothing was touched", () => {
    expect(editedDecls({ radius: "8px", padding: "4px" }, new Set())).toEqual({});
  });

  it("ignores a touched key with no drafted value rather than writing undefined", () => {
    expect(editedDecls({}, new Set(["radius"]))).toEqual({});
  });
});

describe("fanning a write out over the selection", () => {
  it("writes every member", async () => {
    const written: string[] = [];
    const results = await fanOut(["a", "b", "c"], async (id) => {
      written.push(id);
    });
    expect(written.sort()).toEqual(["a", "b", "c"]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(unwritten(results)).toEqual([]);
  });

  it("one member failing does not stop the others", async () => {
    const written: string[] = [];
    const results = await fanOut(["a", "b", "c"], async (id) => {
      if (id === "b") throw new Error("not statically resolvable");
      written.push(id);
    });
    expect(written.sort()).toEqual(["a", "c"]);
    expect(unwritten(results)).toEqual(["b"]);
  });

  it("names why a member was not written, rather than swallowing it", async () => {
    const results = await fanOut(["a"], async () => {
      throw new Error("not statically resolvable");
    });
    expect(results[0].ok).toBe(false);
    expect(results[0].reason).toBe("not statically resolvable");
  });

  it("reports every failure when they all fail", async () => {
    const results = await fanOut(["a", "b"], async () => {
      throw new Error("nope");
    });
    expect(unwritten(results)).toEqual(["a", "b"]);
  });
});
