import { describe, expect, it } from "vitest";
import type { BridgeTree, Selection } from "@vortspec/core/ipc";
import { multiSelectionLabel } from "./RunApp";

/**
 * What the assistant's chip calls the selection (change: scoped-style-edits, Phase 2).
 *
 * The chip is what the user and the assistant agree "the selection" means before a prompt is written
 * against it, so it has to be true about the CURRENT set — including after a reload took some of it away.
 */

const tree = (components: Record<string, string | undefined>): BridgeTree =>
  ({
    roots: [],
    nodes: Object.fromEntries(
      Object.entries(components).map(([id, component]) => [id, { id, tag: "div", classes: [], childCount: 0, component }]),
    ),
    children: {},
  }) as unknown as BridgeTree;

const sel = { nodeId: "a", label: "button", component: "Button" } as unknown as Selection;

describe("naming a selection", () => {
  it("keeps the single-selection label", () => {
    expect(multiSelectionLabel(sel, ["a"], tree({ a: "Button" }))).toBe("Button");
  });

  it("falls back to the element label when it is not a component", () => {
    const plain = { nodeId: "a", label: "div", component: null } as unknown as Selection;
    expect(multiSelectionLabel(plain, ["a"], tree({ a: undefined }))).toBe("div");
  });

  it("names what several members share", () => {
    // "5 Buttons" is something a prompt can be written against.
    const t = tree({ a: "Button", b: "Button", c: "Button" });
    expect(multiSelectionLabel(sel, ["a", "b", "c"], t)).toBe("3 Buttons");
  });

  it("says only the count when they share nothing", () => {
    // Claiming "3 Buttons" for a Button, a Card and a div would ground the assistant in a lie.
    const t = tree({ a: "Button", b: "Card", c: undefined });
    expect(multiSelectionLabel(sel, ["a", "b", "c"], t)).toBe("3 elements");
  });

  it("does not claim a shared component when one member is unmarked", () => {
    const t = tree({ a: "Button", b: "Button", c: undefined });
    expect(multiSelectionLabel(sel, ["a", "b", "c"], t)).toBe("3 elements");
  });

  it("counts what survived a reload, not what was originally selected", () => {
    // Two of the five could not be re-acquired; the chip must not still claim five.
    const t = tree({ a: "Button", b: "Button", c: "Button" });
    expect(multiSelectionLabel(sel, ["a", "b"], t)).toBe("2 Buttons");
  });

  it("survives a tree that has not arrived yet", () => {
    expect(multiSelectionLabel(sel, ["a", "b"], null)).toBe("2 elements");
  });
});
