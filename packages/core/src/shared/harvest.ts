/**
 * Component stand-in harvest (OpenSpec change: light-design-system, group 3). Once a framework
 * component exists, we snapshot its REAL rendered DOM + computed styles from its Storybook stories
 * (per variant/state) and freeze it as a framework-free, inline-styled HTML stand-in. The stand-in is
 * therefore the component's ACTUAL render, not an approximation — this is what closes the visual gap
 * between the light palette and the framework build (identity already converges via the shared
 * contract; harvest reconciles the pixels).
 *
 * This module is PURE: the transform (snapshot tree → stand-in HTML), the token-matching (to keep the
 * dual key on harvested stand-ins), and the placeholder→harvested replacement. The live DOM walk that
 * PRODUCES a `HarvestNode` tree (reading `getComputedStyle` over the whitelist below) is preload/main
 * wiring layered on top; it feeds these pure functions.
 */
import type { StandIn, TokenUse } from "./lite-manifest";
import { findFrameworkPointers } from "./lite-manifest";

/**
 * A captured node: its tag, direct text, the whitelisted computed styles (resolved values), and
 * children. Framework-free by construction — no className, no data-source, no import.
 */
export interface HarvestNode {
  tag: string;
  text?: string;
  styles: Record<string, string>;
  children?: HarvestNode[];
}

/**
 * The visual computed-style properties the capture step should read (via `getComputedStyle`) so the
 * frozen stand-in looks like the real render without pulling the whole (huge, brittle) computed set.
 * Exported so the preload capture and this transform agree on the set.
 */
export const HARVEST_STYLE_PROPS: readonly string[] = [
  "display", "flex-direction", "justify-content", "align-items", "gap", "flex-wrap",
  "width", "height", "padding", "margin", "box-sizing",
  "background", "background-color", "color", "opacity",
  "border", "border-radius", "box-shadow", "outline",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "text-align", "text-transform", "text-decoration",
];

/** HTML void elements — self-closing, no children/text. */
const VOID_TAGS = new Set(["img", "input", "br", "hr", "source", "area", "base", "col", "embed", "link", "meta", "param", "track", "wbr"]);

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Serialize the whitelisted styles to a `style="…"` value (insertion order preserved). */
function styleAttr(styles: Record<string, string>): string {
  const decls = Object.entries(styles)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}:${v}`);
  return decls.join(";");
}

/**
 * Render a harvest snapshot to a framework-free, inline-styled HTML string. A safe tag fallback keeps
 * a malformed capture from producing invalid markup.
 */
export function standInHtml(node: HarvestNode): string {
  const tag = /^[a-z][a-z0-9-]*$/i.test(node.tag) ? node.tag.toLowerCase() : "div";
  const style = styleAttr(node.styles);
  const attr = style ? ` style="${escAttr(style)}"` : "";
  if (VOID_TAGS.has(tag)) return `<${tag}${attr}>`;
  const inner = node.text ? escText(node.text) : "";
  const kids = (node.children ?? []).map(standInHtml).join("");
  return `<${tag}${attr}>${inner}${kids}</${tag}>`;
}

/**
 * Collect the token uses in a snapshot: for every styled property whose resolved value matches a known
 * token value, record `{ token, property }`. Keeps the dual key on harvested stand-ins so compile-back
 * can restore token references. `valueToToken` maps a resolved value to its token name (the caller
 * normalizes — e.g. rgb⇄hex — before passing it in).
 */
export function matchTokenUses(node: HarvestNode, valueToToken: Map<string, string>): TokenUse[] {
  const uses: TokenUse[] = [];
  const seen = new Set<string>();
  const walk = (n: HarvestNode): void => {
    for (const [property, value] of Object.entries(n.styles)) {
      const token = valueToToken.get(value);
      if (!token) continue;
      const key = `${token}|${property}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uses.push({ token, property });
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return uses;
}

/**
 * Freeze one variant's rendered snapshot into a harvested stand-in. Throws if the capture would leak a
 * framework pointer (defensive — a real render should be framework-free). `valueToToken` is optional;
 * when provided, the stand-in carries its `tokensUsed` dual key.
 */
export function harvestStandIn(variant: string, snapshot: HarvestNode, valueToToken?: Map<string, string>): StandIn {
  const html = standInHtml(snapshot);
  const leaks = findFrameworkPointers(html);
  if (leaks.length > 0) throw new Error(`harvested stand-in for "${variant}" leaks framework pointers (${leaks.join(", ")})`);
  const tokensUsed = valueToToken ? matchTokenUses(snapshot, valueToToken) : undefined;
  return { variant, html, source: "harvested", ...(tokensUsed && tokensUsed.length > 0 ? { tokensUsed } : {}) };
}

/**
 * Replace placeholder stand-ins with harvested ones on `framework-ready` (task 3.4). Harvested variants
 * win; any variant not yet harvested keeps its existing (placeholder) stand-in; harvested variants not
 * previously present are appended. Order follows the existing list, then any new harvested variants.
 */
export function mergeHarvestedStandIns(existing: StandIn[], harvested: StandIn[]): StandIn[] {
  const byVariant = new Map(harvested.map((s) => [s.variant, s]));
  const merged: StandIn[] = existing.map((s) => byVariant.get(s.variant) ?? s);
  const existingVariants = new Set(existing.map((s) => s.variant));
  for (const h of harvested) if (!existingVariants.has(h.variant)) merged.push(h);
  return merged;
}
