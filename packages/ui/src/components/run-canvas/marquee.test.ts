import { describe, expect, it } from "vitest";

/**
 * What a marquee selects (change: scoped-style-edits, Phase 2).
 *
 * The rule lives in the guest, which is the only place element geometry exists, so it is restated here
 * against plain rectangles. Two decisions are worth pinning: a marquee takes what it fully ENCLOSES, not
 * what it brushes, and it takes the OUTERMOST enclosed elements rather than every descendant as well.
 */

interface El {
  id: string;
  parent: string | null;
  rect: { left: number; top: number; right: number; bottom: number };
}

/** The guest's `enclosedIds`, restated over a flat parent map. */
function enclosed(els: El[], r: { x: number; y: number; width: number; height: number }): string[] {
  const inside = els.filter(
    (e) => e.rect.left >= r.x && e.rect.top >= r.y && e.rect.right <= r.x + r.width && e.rect.bottom <= r.y + r.height,
  );
  const ids = new Set(inside.map((e) => e.id));
  const parentOf = new Map(els.map((e) => [e.id, e.parent]));
  return inside
    .filter((e) => {
      for (let p = parentOf.get(e.id) ?? null; p; p = parentOf.get(p) ?? null) if (ids.has(p)) return false;
      return true;
    })
    .map((e) => e.id);
}

const box = (id: string, parent: string | null, left: number, top: number, right: number, bottom: number): El => ({
  id,
  parent,
  rect: { left, top, right, bottom },
});

describe("a marquee takes what it encloses", () => {
  const els = [
    box("card", null, 10, 10, 110, 110),
    box("title", "card", 20, 20, 100, 40),
    box("far", null, 500, 500, 600, 600),
  ];

  it("takes an element fully inside it", () => {
    expect(enclosed(els, { x: 0, y: 0, width: 200, height: 200 })).toEqual(["card"]);
  });

  it("does not take an element it merely brushes", () => {
    // A marquee that grabs everything it touches selects things nobody meant to include, and a selection
    // you have to prune is worse than one you have to extend.
    expect(enclosed(els, { x: 0, y: 0, width: 50, height: 50 })).toEqual([]);
  });

  it("takes the outermost enclosed element, not its children too", () => {
    // Selecting a card AND its title would apply an edit twice and make the count meaningless.
    const got = enclosed(els, { x: 0, y: 0, width: 200, height: 200 });
    expect(got).toContain("card");
    expect(got).not.toContain("title");
  });

  it("takes a child when the parent is not fully enclosed", () => {
    // The rectangle covers the title but cuts the card, so the title is the outermost thing inside it.
    expect(enclosed(els, { x: 15, y: 15, width: 90, height: 30 })).toEqual(["title"]);
  });

  it("takes several siblings at once", () => {
    const two = [box("a", null, 0, 0, 10, 10), box("b", null, 20, 0, 30, 10)];
    expect(enclosed(two, { x: 0, y: 0, width: 100, height: 100 }).sort()).toEqual(["a", "b"]);
  });

  it("takes nothing from an empty region", () => {
    expect(enclosed(els, { x: 200, y: 200, width: 100, height: 100 })).toEqual([]);
  });
});
