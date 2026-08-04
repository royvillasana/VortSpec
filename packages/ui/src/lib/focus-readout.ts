import type { NodeReadout } from "@vortspec/core/ipc";

/**
 * Which readout the Design Panel is allowed to show for the currently focused node.
 *
 * THE BUG THIS EXISTS TO REMOVE (Thor, review of #94). `useInspectorBridge`'s `"selectedMany"`
 * handler moves `selectedId`/`selectedIds` and never touches `readout`, and `RunApp`'s `selection`
 * view-model — everything the panel renders — is derived from `readout` ALONE. So: focus A,
 * marquee-select B and C, and the panel keeps showing A's fields while `selectedId` is C. Every
 * single-target operation (reparent, insert-into, inline edit) acts on C. You edit what you see
 * and something else changes.
 *
 * The same shape reaches focus a second way, which the review did not name: additively toggling
 * OFF the focused member hands focus to whatever is left, and `readout` stays pointed at the node
 * that is no longer selected at all.
 *
 * WHY NOT JUST RE-SELECT THE FOCUSED NODE. Sending the guest a `select` for it comes back as a
 * `readout` event with `additive: false`, and that handler does `setSelectedIds([id])` — it would
 * collapse the multi-selection the marquee just made. The fix has to be host-side.
 *
 * WHY NULL IS AN ANSWER. `readouts` is populated by `RunApp`'s request for every member of a
 * multi-selection, so the focused member's readout usually arrives a beat after `selectedMany`.
 * Until it does there is no honest answer, and a blank panel for one frame is the honest one — the
 * alternative is a panel showing a node the user is not editing, which is the defect itself.
 */
export function readoutForFocus(
  current: NodeReadout | null,
  focused: string | null,
  readouts: Readonly<Record<string, NodeReadout>>,
): NodeReadout | null {
  // Nothing focused: `selectionCleared` already nulls the readout, and a marquee that hit nothing
  // leaves an empty selection. Either way there is no node whose fields may be shown.
  if (!focused) return null;
  // Already correct — return the SAME object, not a copy. This runs on every readouts update, and a
  // fresh identity would re-render the panel (and re-key its inputs) on every guest message.
  if (current?.nodeId === focused) return current;
  return readouts[focused] ?? null;
}
