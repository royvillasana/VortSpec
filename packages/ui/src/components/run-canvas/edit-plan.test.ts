import { describe, expect, it } from "vitest";
import { applyClassSwap, coalesceKey, toCanvasEdit, routeEdits, DirtySet } from "./edit-plan";
import type { PendingEdit } from "./pending";
import type { Selection } from "@vortspec/core/ipc";

const sel = (dataSource: string | null): Selection =>
  ({
    nodeId: "n1",
    label: "Button",
    component: "Button",
    file: "src/Button.tsx",
    dataSource,
    resembles: null,
    rect: { x: 0, y: 0, width: 1, height: 1 },
    variants: [],
    sections: [],
  }) as Selection;

const base: PendingEdit = { key: "k", id: "n1::k", label: "L", kind: "style", value: "v", token: null, shared: false, cssProps: [] };

describe("applyClassSwap", () => {
  it("removes then adds, de-duped and order-stable", () => {
    expect(applyClassSwap("btn size-md text-sm", ["size-md"], ["size-lg"])).toBe("btn text-sm size-lg");
    expect(applyClassSwap("a b", [], ["b", "c"])).toBe("a b c"); // no dup of b
  });
});

describe("coalesceKey", () => {
  it("is stable per (kind, node, field) so a burst folds into one entry", () => {
    const a = { ...base, kind: "style" as const, nodeId: "n1", key: "content" };
    const b = { ...base, kind: "style" as const, nodeId: "n1", key: "content", value: "different" };
    expect(coalesceKey(a)).toBe(coalesceKey(b));
    expect(coalesceKey({ ...a, key: "radius" })).not.toBe(coalesceKey(a));
    expect(coalesceKey({ ...a, nodeId: "n2" })).not.toBe(coalesceKey(a));
  });
});

describe("toCanvasEdit", () => {
  it("maps a variant edit to a className swap using the anchor", () => {
    const edit: PendingEdit = { ...base, kind: "variant", key: "variant:size", elementClassName: "btn size-md", removeClasses: ["size-md"], addClasses: ["size-lg"] };
    const r = toCanvasEdit(edit, sel("src/Button.tsx:4:6"));
    expect(r).toEqual({
      file: "src/Button.tsx",
      edit: { op: "attr", anchor: { line: 4, column: 6 }, name: "className", value: { kind: "string", value: "btn size-lg" } },
    });
  });

  it("maps a text edit to setTextNode", () => {
    const edit: PendingEdit = { ...base, key: "content", value: "Save changes" };
    const r = toCanvasEdit(edit, sel("src/Button.tsx:7:8"));
    expect(r).toEqual({ file: "src/Button.tsx", edit: { op: "text", anchor: { line: 7, column: 8 }, text: "Save changes" } });
  });

  it("maps a deletion to deleteNode", () => {
    const edit: PendingEdit = { ...base, remove: true };
    expect(toCanvasEdit(edit, sel("src/Button.tsx:4:6"))?.edit).toEqual({ op: "delete", anchor: { line: 4, column: 6 } });
  });

  it("returns null when there's no anchor (falls back to the other path)", () => {
    const edit: PendingEdit = { ...base, key: "content", value: "x" };
    expect(toCanvasEdit(edit, sel(null))).toBeNull();
  });

  it("returns null for a freeform style edit (needs class inference → AI)", () => {
    const edit: PendingEdit = { ...base, kind: "style", key: "radius", value: "12px" };
    expect(toCanvasEdit(edit, sel("src/Button.tsx:4:6"))).toBeNull();
  });
});

describe("DirtySet", () => {
  it("tracks (file, node) and drains only the delta once", () => {
    const d = new DirtySet();
    d.mark("src/A.tsx", "n1");
    d.mark("src/A.tsx", "n1"); // idempotent
    d.mark("src/B.tsx", "n2");
    expect(d.size).toBe(2);
    expect(d.drain()).toEqual([
      { file: "src/A.tsx", node: "n1" },
      { file: "src/B.tsx", node: "n2" },
    ]);
    expect(d.size).toBe(0); // drained
  });
});

describe("routeEdits — the split RunApp.commitEdits applies", () => {
  const stamped = sel("src/Button.tsx:4:6");
  const unstamped = sel(null);
  const variant: PendingEdit = { ...base, kind: "variant", key: "variant:size", elementClassName: "btn size-md", removeClasses: ["size-md"], addClasses: ["size-lg"] };
  const freeform: PendingEdit = { ...base, kind: "style", key: "radius", value: "12px" };

  it("routes a stamped deterministic edit to the write path, out of the ledger", () => {
    const { deterministic, ledger } = routeEdits([variant], stamped);
    expect(deterministic).toHaveLength(1);
    expect(deterministic[0].edit.op).toBe("attr");
    expect(ledger).toHaveLength(0); // no Apply needed
  });

  it("keeps a freeform-style edit in the ledger (its own AI/Apply path)", () => {
    const { deterministic, ledger } = routeEdits([freeform], stamped);
    expect(deterministic).toHaveLength(0);
    expect(ledger).toHaveLength(1);
  });

  it("keeps everything in the ledger when the element is not stamped (today's behavior)", () => {
    const { deterministic, ledger } = routeEdits([variant, freeform], unstamped);
    expect(deterministic).toHaveLength(0);
    expect(ledger).toHaveLength(2);
  });

  it("splits a mixed batch", () => {
    const { deterministic, ledger } = routeEdits([variant, freeform], stamped);
    expect(deterministic).toHaveLength(1);
    expect(ledger).toHaveLength(1);
  });

  it("routes a token-VALUE edit to the instant token lane (setTokenValue, no Apply)", () => {
    const tokenValue: PendingEdit = { ...base, kind: "token", token: "--color-primary", value: "#ff0000" };
    const { deterministic, tokenValues, ledger } = routeEdits([tokenValue], stamped);
    expect(tokenValues).toEqual([{ token: "--color-primary", value: "#ff0000" }]);
    expect(deterministic).toHaveLength(0);
    expect(ledger).toHaveLength(0); // no Apply — it's deterministic
  });

  it("keeps a token BINDING (var(--x)) in the ledger — it's a source edit, not a value rewrite", () => {
    const binding: PendingEdit = { ...base, kind: "token", token: "--radius-md", value: "var(--radius-md)" };
    const { tokenValues, ledger } = routeEdits([binding], stamped);
    expect(tokenValues).toHaveLength(0);
    expect(ledger).toHaveLength(1);
  });

  it("even unstamped, a token-value edit is still instant (token file, not an element anchor)", () => {
    const tokenValue: PendingEdit = { ...base, kind: "token", token: "--space-4", value: "1.25rem" };
    const { tokenValues, ledger } = routeEdits([tokenValue], unstamped);
    expect(tokenValues).toHaveLength(1);
    expect(ledger).toHaveLength(0);
  });
});
