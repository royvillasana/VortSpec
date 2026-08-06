import { describe, it, expect } from "vitest";
import {
  anchorWithin,
  cursorFingerprints,
  participantCount,
  participantsFrom,
  presenceColor,
  presenceName,
  resolveCursor,
  type Participant,
} from "./live-presence";

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("a cursor points at the same element for everyone", () => {
  // The requirement the anchoring exists for. Two people previewing at different widths have
  // genuinely different geometry, so a shared pixel would land on a different element — and look
  // entirely plausible while doing it.
  it("resolves to the same relative spot in a box of a different size", () => {
    const source = rect(100, 200, 200, 100);
    const anchor = { fp: "main>section>button", ...anchorWithin(source, 150, 250) };
    expect(anchor.fx).toBeCloseTo(0.25);
    expect(anchor.fy).toBeCloseTo(0.5);

    // The same element, laid out narrower and further down on someone else's screen.
    const elsewhere = rect(0, 40, 80, 40);
    expect(resolveCursor(anchor, elsewhere)).toEqual({ x: 20, y: 60 });
  });

  it("keeps the cursor inside its element when the pointer strays a pixel outside", () => {
    const box = rect(0, 0, 100, 100);
    expect(anchorWithin(box, -20, 130)).toEqual({ fx: 0, fy: 1 });
  });

  it("survives a zero-sized element without producing NaN", () => {
    // A collapsed element would otherwise yield NaN, and a NaN position silently draws nothing —
    // or everything, at the origin.
    expect(anchorWithin(rect(10, 10, 0, 0), 10, 10)).toEqual({ fx: 0, fy: 0 });
  });

  it("draws nothing when the element is not on this screen", () => {
    // Not the origin: a stranger's cursor parked in the page corner reads as a bug.
    expect(resolveCursor({ fp: "x", fx: 0.5, fy: 0.5 }, null)).toBeNull();
    expect(resolveCursor({ fp: "x", fx: 0.5, fy: 0.5 }, undefined)).toBeNull();
  });
});

describe("identity", () => {
  it("gives one person the same colour everywhere", () => {
    expect(presenceColor("Roy")).toBe(presenceColor("Roy"));
  });

  it("separates different people", () => {
    const colors = new Set(["Roy", "Ada", "Grace", "Alan", "Katherine"].map(presenceColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("never renders an empty label", () => {
    expect(presenceName("")).toBe("Someone");
    expect(presenceName("   ")).toBe("Someone");
    expect(presenceColor("")).toBeTruthy();
  });
});

describe("reading the awareness channel", () => {
  const states = new Map<number, unknown>([
    [1, { presence: { name: "Roy", color: "#e8590c", cursor: { fp: "a", fx: 0.5, fy: 0.5 } } }],
    [2, { presence: { name: "Ada", color: "#7048e8", cursor: null } }],
    [3, { presence: { name: "Me", color: "#000", cursor: null } }],
  ]);

  it("does not render your own cursor", () => {
    expect(participantsFrom(states, 3).map((p) => p.name)).toEqual(["Roy", "Ada"]);
  });

  it("counts everyone including you", () => {
    // From the size of the awareness map, so a disconnect decrements it by construction rather than
    // by cleanup code that has to be right.
    expect(participantCount(states)).toBe(3);
  });

  it("ignores a peer that has published nothing yet", () => {
    expect(participantsFrom(new Map([[1, {}], [2, undefined]]), 9)).toEqual([]);
  });

  it("discards a malformed cursor rather than trusting it", () => {
    const bad = new Map<number, unknown>([
      [1, { presence: { name: "Roy", cursor: { fp: "", fx: 0, fy: 0 } } }],
      [2, { presence: { name: "Ada", cursor: { fx: 1, fy: 1 } } }],
      [3, { presence: { name: "Alan", cursor: "over there" } }],
    ]);
    expect(participantsFrom(bad, 9).every((p) => p.cursor === null)).toBe(true);
  });

  it("orders stably so cursors do not reshuffle on every tick", () => {
    const shuffled = new Map<number, unknown>([
      [5, { presence: { name: "E" } }],
      [2, { presence: { name: "B" } }],
      [9, { presence: { name: "I" } }],
    ]);
    expect(participantsFrom(shuffled, 0).map((p) => p.clientId)).toEqual([2, 5, 9]);
  });
});

describe("which elements need rects", () => {
  it("collects each fingerprint once", () => {
    const people: Participant[] = [
      { clientId: 1, name: "a", color: "#000", cursor: { fp: "x", fx: 0, fy: 0 } },
      { clientId: 2, name: "b", color: "#000", cursor: { fp: "x", fx: 1, fy: 1 } },
      { clientId: 3, name: "c", color: "#000", cursor: { fp: "y", fx: 0, fy: 0 } },
      { clientId: 4, name: "d", color: "#000", cursor: null },
    ];
    expect(cursorFingerprints(people).sort()).toEqual(["x", "y"]);
  });
});
