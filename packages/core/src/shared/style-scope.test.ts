import { describe, expect, it } from "vitest";
import {
  availableScopes,
  deriveScope,
  matchKey,
  promotionTarget,
  sharedComponent,
  sharedToken,
  sharedValue,
  writesOverlay,
  type ScopeTarget,
} from "./style-scope";

/**
 * These are pure functions over a small, closed rule table, so they are covered by BRANCH rather than by
 * sample: every ordered rule, every reason a scope is withheld, and every uncountable-reach case.
 *
 * The behaviour worth defending hardest is that the derivation reads only what the selection exposes. If a
 * test here ever needs to describe edit history or a remembered preference to predict the answer, the rule
 * has stopped being predictable and the change has regressed.
 */

const card = (
  id: string,
  token?: string,
  component: string | null = "Card",
  value = "8px",
): ScopeTarget => ({
  id,
  component,
  tag: "div",
  tokens: token ? { "border-radius": token } : {},
  values: { "border-radius": value },
});

describe("what a selection shares", () => {
  it("reports a token only when every member resolves through the same one", () => {
    expect(sharedToken([card("a", "radius-card"), card("b", "radius-card")], "border-radius")).toBe("radius-card");
    expect(sharedToken([card("a", "radius-card"), card("b", "radius-pill")], "border-radius")).toBeNull();
    // One member unbound is not agreement — it is the case where an element edit is genuinely right.
    expect(sharedToken([card("a", "radius-card"), card("b")], "border-radius")).toBeNull();
    expect(sharedToken([], "border-radius")).toBeNull();
  });

  it("is per property — agreement on one says nothing about another", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-card")];
    expect(sharedToken(sel, "border-radius")).toBe("radius-card");
    expect(sharedToken(sel, "padding")).toBeNull();
  });

  it("reports a shared current value only when every member has it", () => {
    expect(sharedValue([card("a", undefined, "Card", "8px"), card("b", undefined, "Card", "8px")], "border-radius")).toBe("8px");
    expect(sharedValue([card("a", undefined, "Card", "8px"), card("b", undefined, "Card", "16px")], "border-radius")).toBeNull();
    expect(sharedValue([], "border-radius")).toBeNull();
  });

  it("reports a component only when every member is an instance of the same one", () => {
    expect(sharedComponent([card("a"), card("b")])).toBe("Card");
    expect(sharedComponent([card("a"), card("b", undefined, "Button")])).toBeNull();
    // An unmarked element has no component identity to write an override against.
    expect(sharedComponent([card("a"), card("b", undefined, null)])).toBeNull();
    expect(sharedComponent([])).toBeNull();
  });
});

describe("deriveScope applies its four rules in order", () => {
  it("1 — a shared token wins, even when the members also share a component", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-card")];
    // Both rules match; token is checked first BECAUSE the design system already decides this value.
    expect(sharedComponent(sel)).toBe("Card");
    expect(deriveScope(sel, "border-radius")).toEqual({ scope: "token", key: "radius-card" });
  });

  it("1 — a shared token wins for a single element too", () => {
    expect(deriveScope([card("a", "radius-card")], "border-radius")).toEqual({
      scope: "token",
      key: "radius-card",
    });
  });

  it("2 — a shared component AND a shared value wins when the token is not shared", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-pill")];
    expect(deriveScope(sel, "border-radius")).toEqual({ scope: "matching", key: "Card", value: "8px" });
  });

  it("2 — a shared component with DIFFERING values does not match", () => {
    // The three Buttons at 16px were styled that way on purpose; there is no single "looks like this".
    const sel = [card("a", undefined, "Card", "8px"), card("b", undefined, "Card", "16px")];
    expect(deriveScope(sel, "border-radius")).toEqual({ scope: "selection" });
  });

  it("3 — several members sharing neither fall to the selection", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-pill", "Button", "16px")];
    expect(deriveScope(sel, "border-radius")).toEqual({ scope: "selection" });
  });

  it("4 — one member sharing nothing falls to the element", () => {
    expect(deriveScope([card("a", undefined, null)], "border-radius")).toEqual({ scope: "element" });
  });

  it("an empty selection derives element, which can write nothing", () => {
    expect(deriveScope([], "border-radius")).toEqual({ scope: "element" });
  });
});

describe("availableScopes withholds a scope that has nothing to key on", () => {
  it("offers every scope narrowest-first when everything is shared", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-card")];
    const reach = { matchCounts: { [matchKey("Card", "8px")]: 10 }, tokenUses: { "radius-card": 40 } };
    expect(availableScopes(sel, "border-radius", reach)).toEqual([
      { scope: "element", reach: 1 },
      { scope: "selection", reach: 2 },
      { scope: "matching", key: "Card", value: "8px", reach: 10 },
      { scope: "token", key: "radius-card", reach: 40 },
    ]);
  });

  it("withholds selection for a single element", () => {
    const scopes = availableScopes([card("a", "radius-card")], "border-radius");
    expect(scopes.map((s) => s.scope)).toEqual(["element", "matching", "token"]);
  });

  it("withholds matching for an unmarked element", () => {
    const scopes = availableScopes([card("a", "radius-card", null)], "border-radius");
    expect(scopes.map((s) => s.scope)).toEqual(["element", "token"]);
  });

  it("withholds token for a property the design system does not govern", () => {
    // `padding` has no token AND no recorded value, so only the element scope survives.
    const scopes = availableScopes([{ ...card("a", "radius-card"), values: { "border-radius": "8px", padding: "4px" } }], "padding");
    expect(scopes.map((s) => s.scope)).toEqual(["element", "matching"]);
  });

  it("offers nothing for an empty selection", () => {
    expect(availableScopes([], "border-radius")).toEqual([]);
  });
});

describe("reach is stated or withheld, never guessed", () => {
  it("reports null rather than a number the page cannot supply", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-card")];
    const scopes = availableScopes(sel, "border-radius");
    expect(scopes.find((s) => s.scope === "matching")?.reach).toBeNull();
    expect(scopes.find((s) => s.scope === "token")?.reach).toBeNull();
  });

  it("distinguishes a real zero from an unknown", () => {
    // A component with no instances on this page is a countable 0 — not the same as "cannot count".
    const scopes = availableScopes([card("a")], "border-radius", {
      matchCounts: { [matchKey("Card", "8px")]: 0 },
    });
    expect(scopes.find((s) => s.scope === "matching")?.reach).toBe(0);
  });

  it("counts the narrow scopes from the selection itself", () => {
    const sel = [card("a"), card("b"), card("c")];
    const scopes = availableScopes(sel, "border-radius");
    expect(scopes.find((s) => s.scope === "element")?.reach).toBe(1);
    expect(scopes.find((s) => s.scope === "selection")?.reach).toBe(3);
  });
});

describe("scope decides the destination, and the destination decides the guard", () => {
  it("only the token scope writes the overlay — matching is N page-source writes", () => {
    expect(writesOverlay("element")).toBe(false);
    expect(writesOverlay("selection")).toBe(false);
    expect(writesOverlay("matching")).toBe(false);
    expect(writesOverlay("token")).toBe(true);
  });
});

describe("token promotion is offered only where there is something to promote to", () => {
  it("offers the shared token for a narrow-scoped edit", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-card")];
    expect(promotionTarget("element", sel, "border-radius")).toBe("radius-card");
    expect(promotionTarget("selection", sel, "border-radius")).toBe("radius-card");
  });

  it("does not offer when the members share no token", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-pill")];
    expect(promotionTarget("selection", sel, "border-radius")).toBeNull();
  });

  it("does not offer when the edit is already the token", () => {
    const sel = [card("a", "radius-card"), card("b", "radius-card")];
    expect(promotionTarget("token", sel, "border-radius")).toBeNull();
  });
});
