import { describe, expect, it } from "vitest";

/**
 * How a bridge event changes the selection SET (change: scoped-style-edits, Phase 2).
 *
 * The reducer below mirrors `useInspectorBridge`'s handling of `readout`, `selectionCleared` and
 * `selectionLost`. It is tested here rather than through the hook because what matters is the rule, and
 * the rule is small enough to state exactly: which member is focused after each gesture, and — the one
 * that is genuinely dangerous — that a member which goes away is never replaced by a different element.
 */

interface Sel {
  focused: string | null;
  ids: string[];
}

/** The same transitions the hook applies, in the same order. */
function reduce(sel: Sel, ev: { t: string; id?: string; additive?: boolean }): Sel {
  if (ev.t === "cleared") return { focused: null, ids: [] };
  if (ev.t === "lost") {
    const ids = sel.ids.filter((x) => x !== ev.id);
    return { focused: sel.focused === ev.id ? null : sel.focused, ids };
  }
  const id = ev.id as string;
  if (!ev.additive) return { focused: id, ids: [id] };
  if (!sel.ids.includes(id)) return { focused: id, ids: [...sel.ids, id] };
  const ids = sel.ids.filter((x) => x !== id);
  return { focused: ids[ids.length - 1] ?? null, ids };
}

const start: Sel = { focused: null, ids: [] };
const read = (sel: Sel, id: string, additive = false): Sel => reduce(sel, { t: "readout", id, additive });

describe("a plain selection replaces", () => {
  it("selects one", () => {
    expect(read(start, "a")).toEqual({ focused: "a", ids: ["a"] });
  });

  it("replaces a set of several, rather than adding to it", () => {
    const many = read(read(read(start, "a"), "b", true), "c", true);
    expect(many.ids).toEqual(["a", "b", "c"]);
    expect(read(many, "d")).toEqual({ focused: "d", ids: ["d"] });
  });
});

describe("an additive selection toggles", () => {
  it("adds an unselected member and focuses it", () => {
    expect(read(read(start, "a"), "b", true)).toEqual({ focused: "b", ids: ["a", "b"] });
  });

  it("removes a member that is already selected", () => {
    const three = read(read(read(start, "a"), "b", true), "c", true);
    expect(read(three, "b", true).ids).toEqual(["a", "c"]);
  });

  it("hands focus on when the focused member is removed", () => {
    const two = read(read(start, "a"), "b", true);
    expect(two.focused).toBe("b");
    // Removing the focused member must not leave the panel pointed at something unselected.
    expect(read(two, "b", true)).toEqual({ focused: "a", ids: ["a"] });
  });

  it("empties cleanly when the last member is toggled off", () => {
    expect(read(read(start, "a"), "a", true)).toEqual({ focused: null, ids: [] });
  });

  it("is the same as a plain select when nothing is selected yet", () => {
    expect(read(start, "a", true)).toEqual({ focused: "a", ids: ["a"] });
  });
});

describe("a selection of one behaves exactly as a single selection", () => {
  it("focused and set agree", () => {
    const one = read(start, "a");
    expect(one.ids).toEqual([one.focused]);
  });
});

describe("losing an element shrinks the selection and never retargets it", () => {
  it("drops only the member that went away", () => {
    const three = read(read(read(start, "a"), "b", true), "c", true);
    const after = reduce(three, { t: "lost", id: "b" });
    expect(after.ids).toEqual(["a", "c"]);
    expect(after.focused).toBe("c");
  });

  it("never substitutes another element for a lost focused member", () => {
    const two = read(read(start, "a"), "b", true);
    const after = reduce(two, { t: "lost", id: "b" });
    // "a" is still selected, but nothing is focused — the panel shows no subject rather than the wrong one.
    expect(after.ids).toEqual(["a"]);
    expect(after.focused).toBeNull();
  });

  it("losing an unselected element changes nothing", () => {
    const one = read(start, "a");
    expect(reduce(one, { t: "lost", id: "z" })).toEqual(one);
  });
});

describe("Escape empties the selection", () => {
  it("clears a set of any size", () => {
    const three = read(read(read(start, "a"), "b", true), "c", true);
    expect(reduce(three, { t: "cleared" })).toEqual({ focused: null, ids: [] });
  });
});
