import { describe, expect, it } from "vitest";
import type { Selection } from "@vortspec/core/ipc";
import { fieldIntersection } from "./scope-reach";

/**
 * Which panel fields read `Mixed` for a multi-selection (change: scoped-style-edits, Phase 2).
 *
 * The panel's fields are built from the focused element; this decides, per field, whether the OTHER
 * members agree. The case worth defending is the quiet one: while readouts are still arriving, a member
 * we know nothing about must not be counted as a difference, or the panel flashes `Mixed` and then
 * corrects itself — a lie that fixes itself is still a lie the user may act on.
 */

const selection = (fields: { key: string; value: string }[]): Selection =>
  ({
    nodeId: "a",
    label: "Card",
    component: "Card",
    rect: { x: 0, y: 0, width: 10, height: 10 },
    variants: [],
    sections: [
      {
        id: "appearance",
        title: "Appearance",
        fields: fields.map((f) => ({ ...f, label: f.key, kind: "text", token: null, options: [] })),
      },
    ],
  }) as unknown as Selection;

const readout = (computed: Record<string, string>) => ({ computed });

describe("what a multi-selection agrees on", () => {
  it("is empty for a single selection — nothing to disagree with", () => {
    const sel = selection([{ key: "radius", value: "8px" }]);
    expect(fieldIntersection(sel, ["a"], { a: readout({ "border-radius": "8px" }) })).toEqual({});
  });

  it("marks a field the members differ on", () => {
    const sel = selection([{ key: "radius", value: "8px" }]);
    const readouts = { a: readout({ "border-radius": "8px" }), b: readout({ "border-radius": "16px" }) };
    expect(fieldIntersection(sel, ["a", "b"], readouts)).toHaveProperty("radius");
  });

  it("leaves a field the members agree on unmarked", () => {
    const sel = selection([{ key: "radius", value: "8px" }]);
    const readouts = { a: readout({ "border-radius": "8px" }), b: readout({ "border-radius": "8px" }) };
    expect(fieldIntersection(sel, ["a", "b"], readouts)).toEqual({});
  });

  it("marks each field independently", () => {
    // Agreeing on radius says nothing about font size — the panel decides per field, not per selection.
    const sel = selection([
      { key: "radius", value: "8px" },
      { key: "font-size", value: "14px" },
    ]);
    const readouts = {
      a: readout({ "border-radius": "8px", "font-size": "14px" }),
      b: readout({ "border-radius": "8px", "font-size": "18px" }),
    };
    const mixed = fieldIntersection(sel, ["a", "b"], readouts);
    expect(mixed).not.toHaveProperty("radius");
    expect(mixed).toHaveProperty("font-size");
  });

  it("marks a field that controls two properties when the members differ on either", () => {
    // `padding-left` writes BOTH left and right. Agreeing on one is not agreement.
    const sel = selection([{ key: "padding-left", value: "4px" }]);
    const readouts = {
      a: readout({ "padding-left": "4px", "padding-right": "4px" }),
      b: readout({ "padding-left": "4px", "padding-right": "12px" }),
    };
    expect(fieldIntersection(sel, ["a", "b"], readouts)).toHaveProperty("padding-left");
  });

  it("leaves a composite field unmarked rather than guessing at it", () => {
    // `align`, `resize` and the padding BOX map to no single declaration set, so there is nothing to
    // compare. They are left unmarked — the narrow scopes still edit them correctly, and claiming Mixed
    // for a field we cannot evaluate would be as wrong as claiming agreement.
    const sel = selection([{ key: "align", value: "center|center" }]);
    const readouts = { a: readout({ "justify-content": "center" }), b: readout({ "justify-content": "start" }) };
    expect(fieldIntersection(sel, ["a", "b"], readouts)).toEqual({});
  });

  it("does not call a member we have not heard from a difference", () => {
    // Readouts arrive asynchronously. Not knowing is not the same as knowing they differ.
    const sel = selection([{ key: "radius", value: "8px" }]);
    expect(fieldIntersection(sel, ["a", "b"], { a: readout({ "border-radius": "8px" }) })).toEqual({});
  });

  it("treats a member missing the property as a difference", () => {
    // Absent is not agreement — writing the shared value would set it on an element that never had it.
    const sel = selection([{ key: "radius", value: "8px" }]);
    const readouts = { a: readout({ "border-radius": "8px" }), b: readout({}) };
    expect(fieldIntersection(sel, ["a", "b"], readouts)).toHaveProperty("radius");
  });

  it("has nothing to say without a selection", () => {
    expect(fieldIntersection(null, ["a", "b"], {})).toEqual({});
  });
});
