/**
 * A light page as a CRDT (OpenSpec change: live-playground, task 1.1).
 *
 * The page becomes a `Y.XmlFragment`: an element is a node, an attribute is a map entry, a run of text
 * is a `Y.XmlText`. That mapping is the point of the whole design. Today an edit anchors to
 * `relPath:line:column`, so a concurrent insert above an element silently redirects a later edit to the
 * WRONG element — a stale line number still resolves. Here position is derived from the tree instead of
 * being a value anyone synchronises, so that class of bug has nowhere to live. It also means two people
 * changing `class` and `style` on the same element are writing two different map entries, and both
 * survive; today the whole file is serialized and overwritten, so one of them simply loses.
 *
 * Formatting fidelity rides along in a reserved `data-vs-fmt` attribute per element: the attribute
 * order, the whitespace between them, the quote characters, `<br>` vs `<br />`. It is deliberately kept
 * out of the semantic attributes so that an edit to a value never disturbs the shape of the file — see
 * `light-html.ts` for why a whole-file reformat on first edit would be unacceptable here.
 *
 * Nothing in this module is aware of a network. It earns its place before any relay exists: two windows
 * on the same page stop clobbering each other, and undo becomes a real operation on a real document.
 */
import * as Y from "yjs";
import {
  attrValue,
  canRoundTrip,
  isVoidElement,
  makeRawSuffix,
  parseLightHtml,
  serializeLightHtml,
  type LightAttr,
  type LightNode,
} from "./light-html";

/** The shared type name for a page's tree. One page is one document is one fragment. */
export const PAGE_FRAGMENT = "page";

/** Where per-element formatting lives. Reserved: `serializeDom` strips every `data-vs*` attribute. */
export const FMT_ATTR = "data-vs-fmt";

/** Node names for the two things HTML has and `Y.XmlElement` does not. `#` cannot start a tag name. */
const COMMENT_NODE = "#comment";
const DOCTYPE_NODE = "#doctype";
/** Where a comment's or doctype's text is kept. */
const RAW_ATTR = "d";

/** Serialized formatting for one element. Short keys: this is written once per element in the page. */
type Fmt = {
  /** [name, pre, rawSuffix] per attribute, in source order. */
  a: Array<[string, string, string]>;
  /** Whitespace before the closing `>`. */
  p: string;
  /** The source wrote `/>`. */
  s: 0 | 1;
};

/**
 * Can this page be modelled exactly? Adoption is all-or-nothing on purpose: a page that cannot be
 * reproduced byte for byte is left on today's whole-document write rather than being reformatted into
 * something we can handle. The cost of refusing is that one page is not live; the cost of guessing is a
 * corrupted file in someone's repository.
 */
export function canAdoptLightHtml(html: string): boolean {
  if (html.includes(FMT_ATTR)) return false;
  return canRoundTrip(html);
}

/**
 * Load a page into `doc`'s page fragment. Returns false without touching the document if the page
 * cannot be modelled exactly — callers must treat that as "this page is not collaborative" and fall
 * back, not as an error to report.
 */
export function loadLightHtml(doc: Y.Doc, html: string): boolean {
  if (!canAdoptLightHtml(html)) return false;
  const tree = parseLightHtml(html);
  if (tree === null) return false;
  const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
  doc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    fragment.insert(0, tree.map(toY) as never);
  });
  return true;
}

/** A fresh document holding `html`, or null if the page cannot be modelled exactly. */
export function lightHtmlToDoc(html: string): Y.Doc | null {
  const doc = new Y.Doc();
  if (!loadLightHtml(doc, html)) {
    doc.destroy();
    return null;
  }
  return doc;
}

/** The page as HTML. For an unedited document this is byte-identical to what was loaded. */
export function docToLightHtml(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
  return serializeLightHtml(fromYChildren(fragment));
}

function toY(node: LightNode): Y.XmlElement | Y.XmlText {
  switch (node.kind) {
    case "text": {
      const text = new Y.XmlText();
      text.insert(0, node.value);
      return text;
    }
    case "comment":
    case "doctype": {
      const el = new Y.XmlElement(node.kind === "comment" ? COMMENT_NODE : DOCTYPE_NODE);
      el.setAttribute(RAW_ATTR, node.value);
      return el;
    }
    case "element": {
      const el = new Y.XmlElement(node.name);
      const fmt: Fmt = {
        a: node.attrs.map((a) => [a.name, a.pre, a.rawSuffix] as [string, string, string]),
        p: node.post,
        s: node.selfClosing ? 1 : 0,
      };
      el.setAttribute(FMT_ATTR, JSON.stringify(fmt));
      for (const a of node.attrs) el.setAttribute(a.name, attrValue(a.rawSuffix));
      if (node.children.length > 0) el.insert(0, node.children.map(toY) as never);
      return el;
    }
  }
}

function fromYChildren(parent: Y.XmlFragment | Y.XmlElement): LightNode[] {
  const out: LightNode[] = [];
  for (const child of parent.toArray()) {
    const node = fromY(child);
    if (node !== null) out.push(node);
  }
  return out;
}

function fromY(item: unknown): LightNode | null {
  // Order matters: Y.XmlElement extends Y.XmlFragment, and Y.XmlText extends Y.Text.
  if (item instanceof Y.XmlElement) {
    const name = item.nodeName;
    if (name === COMMENT_NODE) return { kind: "comment", value: item.getAttribute(RAW_ATTR) ?? "" };
    if (name === DOCTYPE_NODE) return { kind: "doctype", value: item.getAttribute(RAW_ATTR) ?? "" };
    return {
      kind: "element",
      name,
      attrs: readAttrs(item),
      post: readFmt(item)?.p ?? "",
      selfClosing: readFmt(item)?.s === 1,
      children: isVoidElement(name) ? [] : fromYChildren(item),
    };
  }
  if (item instanceof Y.XmlText) {
    let value = "";
    for (const op of item.toDelta() as Array<{ insert?: unknown }>) {
      if (typeof op.insert === "string") value += op.insert;
    }
    return { kind: "text", value };
  }
  return null;
}

function readFmt(el: Y.XmlElement): Fmt | null {
  const raw = el.getAttribute(FMT_ATTR);
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Fmt;
    if (!Array.isArray(parsed.a)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Rebuild the attribute list: recorded order first, then anything an edit added since. An attribute
 * whose value still matches what the source said is written back with the source's exact bytes; only a
 * value that actually changed is regenerated, and only that attribute moves in the diff.
 */
function readAttrs(el: Y.XmlElement): LightAttr[] {
  const live = el.getAttributes() as Record<string, string | undefined>;
  const fmt = readFmt(el);
  const out: LightAttr[] = [];
  const seen = new Set<string>([FMT_ATTR]);

  for (const [name, pre, rawSuffix] of fmt?.a ?? []) {
    seen.add(name);
    const value = live[name];
    if (value === undefined) continue; // removed by an edit
    out.push({ pre, name, rawSuffix: attrValue(rawSuffix) === value ? rawSuffix : makeRawSuffix(value) });
  }
  // An attribute an edit introduced joins the list the way the list is already written: on its own
  // line when the element breaks its attributes across lines, otherwise after a single space. The
  // point is the same one as everywhere else here — the diff shows the change, not a reformat.
  const indent = out.length > 0 && out[out.length - 1]!.pre.includes("\n") ? out[out.length - 1]!.pre : " ";
  // Sorted by name, and that is load-bearing rather than tidy. Map iteration order differs between
  // replicas depending on the order updates happened to arrive, so two participants writing the same
  // converged document would otherwise produce files that differ byte for byte — the same page, with
  // two attributes swapped, showing up as a git diff for whoever saved second.
  const extras = Object.entries(live)
    .filter(([name, value]) => !seen.has(name) && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [name, value] of extras) {
    out.push({ pre: indent, name, rawSuffix: makeRawSuffix(value as string) });
  }
  return out;
}
