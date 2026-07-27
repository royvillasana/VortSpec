import { compileLightPage, type LightNode, type CompileOptions, type CompileResult } from "@vortspec/core/compile";
import type { InspectorToken } from "@vortspec/core/ipc";

/**
 * Renderer-side bridge to the deterministic light→framework compile (light-design-system, group 6). The
 * pure `compileLightPage` (core) turns a `LightNode` tree into framework JSX with token references and
 * design-system components restored — but it needs the tree. The most faithful parser is the browser's
 * own `DOMParser`, so we parse the light page's saved HTML here and walk it into `LightNode`s, then feed
 * the pure compiler. This is only ever a HINT handed to the Convert agent (an authoritative skeleton), so
 * a best-effort structural parse is the right fidelity — the agent still owns imports/missing-components/
 * routing.
 */

/** Parse one CSS `style` attribute string into a { prop: value } map (kebab props, as compile expects). */
function parseStyleAttr(attr: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (attr ?? "").split(";")) {
    const s = pair.trim();
    if (!s) continue;
    const i = s.indexOf(":");
    if (i <= 0) continue;
    out[s.slice(0, i).trim().toLowerCase()] = s.slice(i + 1).trim();
  }
  return out;
}

/** Walk a live DOM element into a `LightNode` (data-component → component, style attr → resolved styles). */
export function elementToLightNode(el: Element): LightNode {
  const node: LightNode = { tag: el.tagName.toLowerCase() };
  const component = el.getAttribute("data-component");
  if (component) {
    node.component = component;
    const variant = el.getAttribute("data-variant");
    if (variant) node.props = { variant };
  }
  const styles = parseStyleAttr(el.getAttribute("style"));
  if (Object.keys(styles).length > 0) node.styles = styles;

  const children = Array.from(el.children);
  if (children.length === 0) {
    const text = el.textContent?.trim();
    if (text) node.text = text;
  } else {
    node.children = children.map(elementToLightNode);
  }
  return node;
}

/** Parse a light page's HTML into a single root `LightNode` (wrapping multiple top-level nodes in a div). */
export function htmlToLightNode(html: string): LightNode {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const roots = Array.from(doc.body.children);
  if (roots.length === 1) return elementToLightNode(roots[0]);
  return { tag: "div", children: roots.map(elementToLightNode) };
}

/**
 * Build the compile's value→token-reference map from the project's tokens. A resolved value maps to the
 * framework token reference `var(--<name>)`; the first token wins on a value collision (deterministic).
 */
export function buildTokenMaps(tokens: InspectorToken[]): CompileOptions {
  const valueToTokenRef = new Map<string, string>();
  const knownTokenValues = new Set<string>();
  for (const t of tokens) {
    if (!t.resolvedValue) continue;
    knownTokenValues.add(t.resolvedValue);
    if (!valueToTokenRef.has(t.resolvedValue)) valueToTokenRef.set(t.resolvedValue, `var(--${t.name})`);
  }
  return { valueToTokenRef, knownTokenValues };
}

/** Deterministically compile a light page's HTML to framework JSX + coverage, using the project's tokens. */
export function compileLightHtml(html: string, tokens: InspectorToken[]): CompileResult {
  return compileLightPage(htmlToLightNode(html), buildTokenMaps(tokens));
}
