import { describe, expect, it } from "vitest";
import type { BridgeTree } from "@vortspec/core/ipc";
import { visibleForFilter } from "./NodeTree";

/**
 * Layer search (change: design-system-style-panel, task 1.6). A real screen's tree runs to dozens of
 * nodes, so reaching one by scrolling and expanding is the slowest part of editing it. Typing `footer`
 * has to land on the footer — while keeping its ancestors visible, or the match loses its context.
 */

const node = (
  tag: string,
  extra: { component?: string; idAttr?: string; classes?: string[] } = {},
) => ({ tag, classes: extra.classes ?? [], childCount: 0, ...extra });

// div > card > (header, footer > text-label)
const TREE = {
  roots: ["div"],
  nodes: {
    div: node("div"),
    card: node("div", { component: "card" }),
    header: node("header", { component: "header" }),
    footer: node("footer", { component: "footer" }),
    "text-label": node("span", { idAttr: "text-label" }),
  },
  children: { div: ["card"], card: ["header", "footer"], footer: ["text-label"] },
} as unknown as BridgeTree;

describe("visibleForFilter", () => {
  it("is null when not filtering, which is not the same as matching nothing", () => {
    expect(visibleForFilter(TREE, "")).toBeNull();
    expect(visibleForFilter(TREE, "   ")).toBeNull();
    expect(visibleForFilter(null, "footer")).toBeNull();
    // Filtering with no match is an EMPTY SET, so the caller can say "nothing matched" instead of
    // silently rendering the whole tree.
    expect(visibleForFilter(TREE, "zzz")).toEqual(new Set());
  });

  it("keeps the match and its ancestors, and nothing else", () => {
    // The user types "footer" to get straight to it — `header` must not survive, or the search did nothing.
    expect(visibleForFilter(TREE, "footer")).toEqual(new Set(["footer", "card", "div"]));
  });

  it("matches case-insensitively and on a partial name", () => {
    expect(visibleForFilter(TREE, "FOOT")).toEqual(new Set(["footer", "card", "div"]));
  });

  it("matches the id/class hint too, since that is what distinguishes plain elements", () => {
    // `text-label` is a bare <span>; its id is the only thing that identifies it in the tree.
    expect(visibleForFilter(TREE, "text-label")).toEqual(
      new Set(["text-label", "footer", "card", "div"]),
    );
  });

  it("keeps every match when several hit", () => {
    // Both `header` and `footer` contain "er".
    expect(visibleForFilter(TREE, "er")).toEqual(new Set(["header", "footer", "card", "div"]));
  });
});
