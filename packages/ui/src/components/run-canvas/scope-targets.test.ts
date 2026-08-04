import { describe, expect, it } from "vitest";
import { scopeTargets } from "./scope-reach";
import { availableScopes, deriveScope } from "@vortspec/core/style-scope";
import type { Selection } from "@vortspec/core/ipc";

/**
 * The scope rules must see EVERY selected member (change: scoped-style-edits).
 *
 * THIS FILE IMPORTS THE SHIPPED FUNCTIONS — `scopeTargets`, `deriveScope`, `availableScopes` — and
 * that is the point. Thor's review of #94 found `scopeTargets` returning a length-1 array
 * unconditionally, so `deriveScope`'s `selection.length > 1` branch was structurally unreachable
 * through the live UI, in the change whose whole subject is scope. His finding 4 was that the
 * neighbouring tests could not have caught it: they restate the logic rather than importing it, and
 * a restated copy passes on the broken version.
 *
 * So the assertions below go through the real pipeline, panel-input to scope verdict. The cases
 * marked THE DEFECT fail against the length-1 version.
 */

/** A member as the panel builds it: one section, one field, with the field's token and value. */
function member(nodeId: string, component: string | null, token: string | undefined, value: string): Selection {
  return {
    nodeId,
    label: nodeId,
    component,
    variants: [],
    sections: [{ id: "layout", title: "Layout", fields: [{ key: "padding", label: "Padding", value, token }] }],
  } as unknown as Selection;
}

describe("scopeTargets — every member reaches the scope rules", () => {
  it("THE DEFECT: three selected members produce three targets, not one", () => {
    const sel = [member("a", "Card", undefined, "8px"), member("b", "Card", undefined, "8px"), member("c", "Card", undefined, "16px")];
    expect(scopeTargets(sel)).toHaveLength(3);
  });

  it("THE DEFECT: a disagreeing multi-selection derives `selection`, not `element`", () => {
    // Thor's own example: three Cards, two at 8px and one at 16px. There is no shared value, so
    // "looks like this" has nothing to key on and the honest scope is the selection itself.
    const sel = [member("a", "Card", undefined, "8px"), member("b", "Card", undefined, "8px"), member("c", "Card", undefined, "16px")];
    expect(deriveScope(scopeTargets(sel), "padding").scope).toBe("selection");
  });

  it("THE DEFECT: the `selection` scope is offered, with its real reach", () => {
    const sel = [member("a", "Card", undefined, "8px"), member("b", "Card", undefined, "16px")];
    const offered = availableScopes(scopeTargets(sel), "padding");
    expect(offered.find((o) => o.scope === "selection")?.reach).toBe(2);
  });

  it("a shared token across members still derives the component-token scope", () => {
    // The reason the members are BUILT rather than inferred: each one's token comes from its own
    // readout through `buildSelection`. A computed style could not tell us this — it reports the
    // resolved value, not the `var()` — and guessing it would justify a wide edit with a guess.
    const sel = [member("a", "Card", "--space-2", "8px"), member("b", "Card", "--space-2", "8px")];
    const derived = deriveScope(scopeTargets(sel), "padding");
    expect(derived.scope).toBe("component-token");
    expect(derived.token).toBe("--space-2");
  });

  it("same component, same value, no token → `matching`", () => {
    const sel = [member("a", "Card", undefined, "8px"), member("b", "Card", undefined, "8px")];
    expect(deriveScope(scopeTargets(sel), "padding").scope).toBe("matching");
  });

  it("CONTROL: one member is never offered the `selection` scope", () => {
    // Every case above needs MORE than one target, so a `scopeTargets` that fabricated members
    // would satisfy them all. This is the polarity that says it must not.
    //
    // Note what one member DOES derive: `matching`, not `element` — rule 2 fires on a shared
    // component plus a shared value, and one element trivially shares both with itself. That is
    // the shipped behaviour and this test asserts it rather than the behaviour I first assumed;
    // `element` is what you get when there is nothing to key on, which is the case below.
    const one = scopeTargets(member("a", "Card", undefined, "8px"));
    expect(one).toHaveLength(1);
    expect(deriveScope(one, "padding").scope).toBe("matching");
    expect(availableScopes(one, "padding").some((o) => o.scope === "selection")).toBe(false);
  });

  it("CONTROL: one member with nothing to key on derives `element`", () => {
    const one = scopeTargets(member("a", null, undefined, "8px"));
    expect(deriveScope(one, "padding").scope).toBe("element");
  });

  it("CONTROL: the single-Selection call shape still works, and null is empty", () => {
    // `DesignPanel` falls back to `selection` when `memberSelections` is absent, so the old shape
    // has to keep working — otherwise the fallback silently becomes the defect again.
    expect(scopeTargets(member("a", null, undefined, "8px"))).toHaveLength(1);
    expect(scopeTargets(null)).toEqual([]);
  });

  it("a member that has not been built yet is absent, not a blank target", () => {
    // `RunApp` omits a member whose readout has not landed. A `null` slot must drop out rather than
    // become a target with no tokens and no values — that would read as disagreement and push the
    // scope wider than the facts support.
    expect(scopeTargets([member("a", "Card", "--space-2", "8px"), null])).toHaveLength(1);
    expect(deriveScope(scopeTargets([member("a", "Card", "--space-2", "8px"), null]), "padding").scope).toBe(
      "component-token",
    );
  });
});
