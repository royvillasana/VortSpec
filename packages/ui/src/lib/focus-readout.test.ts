import { describe, expect, it } from "vitest";
import { readoutForFocus } from "./focus-readout";
import type { NodeReadout } from "@vortspec/core/ipc";

/**
 * The Design Panel must show the focused node, or nothing (change: scoped-style-edits).
 *
 * THIS FILE IMPORTS THE SHIPPED RULE. Its neighbours `selection-set.test.ts` and `marquee.test.ts`
 * say in their own docstrings that they restate the hook's and the guest's logic rather than
 * importing it, and Thor's review of #94 named the consequence: both of the bugs he found are
 * invisible to those tests BY CONSTRUCTION. A restated reducer passes on the broken version,
 * because the copy under test is not the code that ships — the same defect as a hand-maintained
 * list checked against itself, in product code this time.
 *
 * So `readoutForFocus` is the real function `useInspectorBridge` calls, and the case below marked
 * THE DEFECT fails against the unfixed hook.
 */

const readout = (nodeId: string): NodeReadout => ({ nodeId }) as unknown as NodeReadout;

describe("readoutForFocus — the panel follows the focus, or shows nothing", () => {
  it("THE DEFECT: focus moved by a marquee does not leave the panel on the old node", () => {
    // Focus A, then marquee B and C: the hook focuses the last member, C. Before the fix the panel
    // kept rendering A's fields while reparent/insert-into/inline-edit acted on C.
    const a = readout("A");
    expect(readoutForFocus(a, "C", { B: readout("B"), C: readout("C") })).toEqual(readout("C"));
  });

  it("shows nothing rather than the wrong node while the readout is still in flight", () => {
    // `RunApp` requests readouts for every member the moment a multi-selection exists, so this is
    // the one-frame gap between `selectedMany` and `readouts` landing. A blank panel is honest; the
    // previously focused node's fields are not.
    const a = readout("A");
    expect(readoutForFocus(a, "C", {})).toBeNull();
    expect(readoutForFocus(a, "C", { B: readout("B") })).toBeNull();
  });

  it("the additive toggle that removes the focused member — the second way in", () => {
    // Not in the review. Toggling OFF the focused member hands focus to what is left, and `readout`
    // would keep pointing at a node that is no longer selected at all.
    expect(readoutForFocus(readout("C"), "B", { A: readout("A"), B: readout("B") })).toEqual(readout("B"));
  });

  it("returns the SAME object when it is already correct, not a copy", () => {
    // Identity, not equality, and deliberately so: this runs on every `readouts` message. A fresh
    // object would re-render the panel and re-key its inputs mid-edit. `toEqual` would pass on a
    // copy, so this is the assertion that can tell the difference.
    const a = readout("A");
    expect(readoutForFocus(a, "A", { A: readout("A") })).toBe(a);
  });

  it("nothing focused means nothing shown", () => {
    expect(readoutForFocus(readout("A"), null, { A: readout("A") })).toBeNull();
  });

  it("CONTROL: a single selection is untouched by any of this", () => {
    // Every case above is a rejection or a replacement. Without this, a rule that always returned
    // null would satisfy them and break the ordinary path — one click, one node, its own fields.
    const a = readout("A");
    expect(readoutForFocus(a, "A", {})).toBe(a);
  });
});
