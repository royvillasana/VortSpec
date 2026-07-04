import { load, type CheerioAPI } from "cheerio";

export { load } from "cheerio";
export type { CheerioAPI };

/**
 * Minimal Element interface compatible with domhandler's Element.
 * Cheerio 1.x no longer re-exports this type directly.
 */
export interface Element {
  type: string;
  tagName: string;
  attribs: Record<string, string>;
  children: Element[];
  parent: Element | null;
}

/**
 * Get the class list for an element.
 */
export function getClasses(el: Element, $: CheerioAPI): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cls = $(el as any).attr("class");
  if (!cls) return [];
  return cls.split(/\s+/).filter(Boolean);
}

/**
 * Get a simple structural signature of an element's children.
 * Used for detecting repeated patterns.
 */
export function childSignature(el: Element, $: CheerioAPI): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = $(el as any).children().toArray() as unknown as Element[];
  return children
    .map((child) => {
      const tag = child.tagName?.toLowerCase() ?? "?";
      const cls = getClasses(child, $).sort().join(".");
      return cls ? `${tag}.${cls}` : tag;
    })
    .join("|");
}

/**
 * Walk a DOM tree depth-first, calling fn for each element.
 */
export function walkDOM(
  $: CheerioAPI,
  root: Element,
  fn: (el: Element, depth: number) => void,
  depth = 0,
): void {
  fn(root, depth);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = $(root as any).children().toArray() as unknown as Element[];
  children.forEach((child) => {
    if (child.type === "tag") walkDOM($, child, fn, depth + 1);
  });
}
