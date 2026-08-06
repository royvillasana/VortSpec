/**
 * Two-way binding between a light page's CRDT and the live DOM it renders as (OpenSpec change:
 * live-playground, task 1.2).
 *
 * The Playground already edits by mutating the guest DOM directly — the DOM is the working source and
 * the file is a snapshot of it. This module keeps a `Y.Doc` alongside that DOM so the same edits also
 * land in a document that can merge. Local DOM mutations become CRDT operations; CRDT operations
 * (from another window today, another person once a relay exists) become DOM mutations.
 *
 * The DOM is built from the CRDT node by node rather than through `innerHTML`, deliberately. Parsing
 * markup would let the HTML parser insert nodes nobody asked for — the implied `<tbody>` being the
 * classic one — and every such node would be a DOM node with no CRDT counterpart, which is precisely
 * the misalignment that later sends an edit to the wrong element. Building the tree ourselves makes
 * the DOM↔CRDT mapping 1:1 by construction instead of by hope.
 *
 * Avoiding the echo loop is the other half, and the obvious way to do it is wrong. Draining the
 * MutationObserver's queue around a remote write does stop the echo — mutation records arrive on a
 * microtask, so a remote change would otherwise return as a "local" edit a tick later — but it also
 * throws away any genuine local edit that happened to be queued behind it. Two people editing two
 * different elements in the same tick is not a rare case, and losing one of those edits is the exact
 * failure the whole change exists to prevent.
 *
 * So nothing is discarded. Instead every write in the DOM→CRDT direction is idempotent: setting an
 * attribute to the value the document already holds produces no operation at all. An echo therefore
 * dies on arrival rather than being intercepted, and a real edit queued next to it still lands.
 */
import * as Y from "yjs";
import { FMT_ATTR, PAGE_FRAGMENT } from "@vortspec/core/light-doc";

/** Marks a CRDT transaction as "this came from the DOM" so the observer does not echo it back. */
export const LOCAL_ORIGIN = "vs-dom";

/** The DOM surface this module needs — the guest's `document`, or a test's. */
type Doc = Pick<Document, "createElement" | "createTextNode" | "createComment">;

export type LightBinding = {
  /** Stop observing in both directions. Leaves the DOM and the document as they are. */
  destroy(): void;
};

type YNode = Y.XmlElement | Y.XmlText;

/** Node names `light-doc` uses for the two things `Y.XmlElement` has no type for. */
const COMMENT_NODE = "#comment";
const DOCTYPE_NODE = "#doctype";
const RAW_ATTR = "d";

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;
const NODE_COMMENT = 8;

/**
 * Render the document's page fragment into `container` (replacing its children) and keep the two in
 * sync until `destroy()`. `container` is the element the page's top-level nodes live under — in the
 * guest that is `document.documentElement`'s parent stand-in; in a test it is any element.
 *
 * The doctype node is skipped: a live document's doctype cannot be replaced, and it is carried
 * losslessly in the CRDT for serialization regardless.
 */
export function bindLightDom(doc: Y.Doc, container: Element, document: Doc): LightBinding {
  return start(doc, container, document, "build")!;
}

/**
 * Bind to the DOM the browser has ALREADY rendered, instead of replacing it.
 *
 * This is the one the guest uses, and the difference matters. The Playground loads a light page over
 * a local HTTP server, and by the time we get there the page is live: the light server has injected a
 * token stylesheet, the inspector has minted a node id per element, and the page's own scripts have
 * run. Rebuilding that document from the CRDT would throw all of it away to gain nothing the user can
 * see — on the app's most fragile seam, where a rendering failure surfaces as a selector error rather
 * than as itself.
 *
 * So the live tree is paired with the CRDT tree node by node. If they line up, we observe and never
 * touch what is on screen. If they diverge anywhere — the HTML parser inserted an implied `<tbody>`,
 * a script rewrote the page before we arrived — this returns `null` and that page is simply not live.
 * Refusing costs a collaborative session; guessing costs a misaligned tree, which is how an edit ends
 * up applied to the wrong element.
 */
export function adoptLightDom(doc: Y.Doc, container: Element, document: Doc): LightBinding | null {
  return start(doc, container, document, "adopt");
}

/**
 * Adopt a whole page the way the guest actually has it: a live `document`, not a container element.
 *
 * The CRDT's top level is `[doctype, whitespace, <html>]`, and only the `<html>` has a counterpart on
 * screen — a document's doctype cannot be replaced and the whitespace between them is not a node the
 * browser kept. So the page's root element is paired with `document.documentElement` and everything
 * below follows. The skipped top-level nodes are still carried in the CRDT, so writing the file back
 * reproduces it exactly.
 */
export function adoptLightPage(doc: Y.Doc, document: Document, problem?: { at: string }): LightBinding | null {
  const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
  const root = (fragment.toArray() as YNode[]).find(
    (node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName.toLowerCase() === "html",
  );
  if (!root || !document.documentElement) return null;
  return start(doc, document.documentElement, document, "adopt", root, problem);
}

function start(
  doc: Y.Doc,
  container: Element,
  document: Doc,
  mode: "build" | "adopt",
  /** When given, `container` IS this node rather than its parent. */
  rootY?: Y.XmlElement,
  problem?: { at: string },
): LightBinding | null {
  const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
  const domFor = new Map<YNode, Node>();
  const yFor = new WeakMap<Node, YNode>();

  const link = (y: YNode, node: Node): void => {
    domFor.set(y, node);
    yFor.set(node, y);
  };

  /**
   * Formatting records rescued from nodes deleted in the current batch, so a MOVED element keeps the
   * source's attribute order and spacing. A move is a delete plus a fresh insert (the document has no
   * move operation), and without this the re-created element loses its `data-vs-fmt` and comes back
   * with attributes in alphabetical order — turning "I dragged a button" into a diff that also
   * reshuffles its attributes. Observed on a real page before it was fixed.
   */
  const rescuedFmt = new WeakMap<Node, string>();
  const rescueFmt = (node: Node): void => {
    const y = yFor.get(node);
    if (y instanceof Y.XmlElement) {
      const fmt = y.getAttribute(FMT_ATTR);
      if (typeof fmt === "string") rescuedFmt.set(node, fmt);
    }
    for (const child of Array.from(node.childNodes)) rescueFmt(child);
  };

  const build = (y: YNode): Node | null => {
    if (y instanceof Y.XmlText) {
      const node = document.createTextNode(textOf(y));
      link(y, node);
      return node;
    }
    if (y.nodeName === DOCTYPE_NODE) return null;
    if (y.nodeName === COMMENT_NODE) {
      const node = document.createComment(y.getAttribute(RAW_ATTR) ?? "");
      link(y, node);
      return node;
    }
    const el = document.createElement(y.nodeName);
    for (const [name, value] of Object.entries(y.getAttributes())) {
      if (name === FMT_ATTR || typeof value !== "string") continue;
      el.setAttribute(name, value);
    }
    link(y, el);
    for (const child of y.toArray()) {
      const built = build(child as YNode);
      if (built) el.appendChild(built);
    }
    return el;
  };

  if (mode === "build") {
    while (container.firstChild) container.removeChild(container.firstChild);
    for (const top of fragment.toArray()) {
      const built = build(top as YNode);
      if (built) container.appendChild(built);
    }
  } else if (rootY) {
    link(rootY, container);
    if (!pair(rootY, container, link, "html", problem)) return null;
  } else if (!pair(fragment, container, link)) {
    return null;
  }

  // ── CRDT → DOM ────────────────────────────────────────────────────────
  const applyRemote = (events: Y.YEvent<never>[], tx: Y.Transaction): void => {
    if (tx.origin === LOCAL_ORIGIN) return; // our own DOM-sourced write coming back around
    for (const event of events) {
      const target = event.target as YNode;
      const node = domFor.get(target);
      if (!node) continue;
      if (target instanceof Y.XmlText) {
        (node as Text).data = textOf(target);
        continue;
      }
      const el = node as Element;
      const attributesChanged = event instanceof Y.YXmlEvent ? event.attributesChanged : new Set<string>();
      for (const key of attributesChanged) {
        if (key === FMT_ATTR) continue;
        const value = target.getAttribute(key);
        if (typeof value === "string") el.setAttribute(key, value);
        else el.removeAttribute(key);
      }
      applyChildDelta(el, event.changes.delta as Delta[], build);
    }
  };
  fragment.observeDeep(applyRemote as never);

  // ── DOM → CRDT ────────────────────────────────────────────────────────
  const observer = new MutationObserver((records) => {
    doc.transact(() => {
      // Two passes over the batch, removals before insertions. A drag on the canvas is ONE node
      // removed from where it was and inserted where it went, reported as two records — and in the
      // order the browser happens to give them. Processing them as they arrive either duplicates the
      // element (insert seen first, then a delete that no longer matches) or loses it entirely.
      for (const record of records) applyRecord(record, yFor, link, document, "remove", rescuedFmt, rescueFmt);
      for (const record of records) applyRecord(record, yFor, link, document, "insert", rescuedFmt, rescueFmt);
    }, LOCAL_ORIGIN);
  });
  observer.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  return {
    destroy(): void {
      observer.disconnect();
      fragment.unobserveDeep(applyRemote as never);
      domFor.clear();
    },
  };
}

/**
 * Walk the CRDT tree and the live DOM in lockstep, linking each pair. False the moment they disagree
 * about the shape of the document — no repair, no best effort.
 *
 * Doctype nodes are skipped: they are carried in the CRDT so the file can be written back exactly,
 * but they are not children of the element we are given.
 */
function pair(
  yParent: Y.XmlFragment | Y.XmlElement,
  domParent: Element,
  link: (y: YNode, node: Node) => void,
  /** Where we are, so a refusal can say WHICH element disagreed rather than just that one did. */
  path = "html",
  problem?: { at: string },
): boolean {
  const yChildren = (yParent.toArray() as YNode[]).filter(
    (child) => !(child instanceof Y.XmlElement && child.nodeName === DOCTYPE_NODE),
  );
  // Instrumentation the canvas injected is not part of the page and has no counterpart to pair with.
  const domChildren = Array.from(domParent.childNodes).filter((node) => !isInstrumentation(node));
  if (yChildren.length !== domChildren.length) {
    if (problem && !problem.at) {
      const fileKids = yChildren.map(describeY).join(",");
      const domKids = domChildren.map(describeDom).join(",");
      problem.at = `${path}: file has ${yChildren.length} children [${fileKids}], page has ${domChildren.length} [${domKids}]`;
    }
    return false;
  }

  for (let i = 0; i < yChildren.length; i += 1) {
    const y = yChildren[i]!;
    const node = domChildren[i]!;
    const where = `${path}>${describeY(y)}[${i}]`;
    if (y instanceof Y.XmlText) {
      if (node.nodeType !== NODE_TEXT) {
        if (problem && !problem.at) problem.at = `${where}: file has text, page has ${describeDom(node)}`;
        return false;
      }
      link(y, node);
      continue;
    }
    if (y.nodeName === COMMENT_NODE) {
      if (node.nodeType !== NODE_COMMENT) {
        if (problem && !problem.at) problem.at = `${where}: file has a comment, page has ${describeDom(node)}`;
        return false;
      }
      link(y, node);
      continue;
    }
    if (node.nodeType !== NODE_ELEMENT) {
      if (problem && !problem.at) problem.at = `${where}: page has ${describeDom(node)}`;
      return false;
    }
    const el = node as Element;
    if (el.tagName.toLowerCase() !== y.nodeName.toLowerCase()) {
      if (problem && !problem.at) problem.at = `${where}: page has <${el.tagName.toLowerCase()}>`;
      return false;
    }
    link(y, el);
    // A void element's CRDT node has no children, and neither does its DOM node.
    if (!pair(y, el, link, where, problem)) return false;
  }
  return true;
}

type Delta = { retain?: number; insert?: unknown[]; delete?: number };

/** Replay a Yjs child delta onto a DOM element's child list. */
function applyChildDelta(el: Element, delta: Delta[], build: (y: YNode) => Node | null): void {
  let index = 0;
  for (const op of delta) {
    if (op.retain !== undefined) {
      index += op.retain;
      continue;
    }
    if (op.delete !== undefined) {
      for (let i = 0; i < op.delete; i += 1) {
        const child = el.childNodes[index];
        if (child) el.removeChild(child);
      }
      continue;
    }
    if (op.insert !== undefined) {
      for (const y of op.insert) {
        const node = build(y as YNode);
        if (!node) continue;
        const before = el.childNodes[index] ?? null;
        el.insertBefore(node, before);
        index += 1;
      }
    }
  }
}

const describeY = (y: YNode): string =>
  y instanceof Y.XmlText ? "#text" : y.nodeName === COMMENT_NODE ? "#comment" : `<${y.nodeName}>`;

const describeDom = (n: Node): string =>
  n.nodeType === NODE_TEXT
    ? `#text${JSON.stringify((n as Text).data.slice(0, 12))}`
    : n.nodeType === NODE_COMMENT
      ? "#comment"
      : n.nodeType === NODE_ELEMENT
        ? `<${(n as Element).tagName.toLowerCase()}>`
        : `#${n.nodeType}`;

/** True once this node has been deleted from the document — its mapping is stale. */
function isDeleted(y: YNode): boolean {
  const item = (y as unknown as { _item?: { deleted: boolean } | null })._item;
  return item ? item.deleted : false;
}

function applyRecord(
  record: MutationRecord,
  yFor: WeakMap<Node, YNode>,
  link: (y: YNode, node: Node) => void,
  document: Doc,
  phase: "remove" | "insert",
  rescuedFmt: WeakMap<Node, string>,
  rescueFmt: (node: Node) => void,
): void {
  const targetY = yFor.get(record.target);
  if (!targetY) return; // a node we never mapped — not part of the page

  if (record.type === "attributes") {
    if (phase !== "remove") return;
    if (!(targetY instanceof Y.XmlElement)) return;
    const name = record.attributeName;
    if (!name || isInstrumentationAttr(name)) return;
    const value = (record.target as Element).getAttribute(name);
    // Idempotent on purpose: a mutation record fires even when an attribute is set to the value it
    // already had, so writing unconditionally here is what would turn one remote change into an
    // endless exchange between two peers.
    const current = targetY.getAttribute(name);
    if (value === null) {
      if (current !== undefined) targetY.removeAttribute(name);
      return;
    }
    if (current !== value) targetY.setAttribute(name, value);
    return;
  }

  if (record.type === "characterData") {
    if (phase !== "remove") return;
    if (!(targetY instanceof Y.XmlText)) return;
    const next = (record.target as Text).data;
    const current = textOf(targetY);
    if (next === current) return;
    targetY.delete(0, current.length);
    targetY.insert(0, next);
    return;
  }

  if (record.type === "childList") {
    if (!(targetY instanceof Y.XmlElement) && !(targetY instanceof Y.XmlText)) return;
    if (targetY instanceof Y.XmlText) return;
    if (phase === "remove") {
      for (const removed of Array.from(record.removedNodes)) {
        const y = yFor.get(removed);
        if (!y) continue;
        rescueFmt(removed); // in case this is the first half of a move

        const index = targetY.toArray().indexOf(y as never);
        if (index >= 0) targetY.delete(index, 1);
      }
      return;
    }
    for (const added of Array.from(record.addedNodes)) {
      const known = yFor.get(added);
      // A node whose CRDT counterpart is still live is one we already have — a remote insert we
      // just built. A node whose counterpart was DELETED in this same batch is a move: the document
      // has no move operation, so it is re-created here rather than skipped.
      if (known && !isDeleted(known)) continue;
      if (isInstrumentation(added)) continue;
      const built = toY(added, link, document, rescuedFmt);
      if (!built) continue;
      const index = domIndexOf(record.target as Element, added, yFor);
      if (index < 0) continue;
      targetY.insert(index, [built as never]);
    }
  }
}

/**
 * Attributes the canvas puts on the page that are not part of it, and must never reach the document.
 *
 * `contenteditable` is the one that is easy to miss and expensive to get wrong: the guest sets it on
 * an element for the duration of an inline text edit, and `serializeDom` strips it before saving. If
 * the CRDT kept it, editing any text would permanently write `contenteditable="true"` into the file —
 * quietly, and for everyone.
 *
 * This list must agree with what `serializeDom` strips (see `useInspectorBridge.ts`).
 */
function isInstrumentationAttr(name: string): boolean {
  return name === FMT_ATTR || name.startsWith("data-vs") || name === "contenteditable";
}

/**
 * Is this node the canvas's own instrumentation rather than part of the page? The canvas injects
 * selection overlays and a token stylesheet into the guest, and they must never enter the document —
 * otherwise participants would sync one another's selection boxes into the saved file.
 *
 * This list mirrors exactly what `serializeDom` strips before writing a page (see
 * `useInspectorBridge.ts`). The two must agree: anything serialization removes but the binding keeps
 * would appear live for everyone and then vanish on save.
 */
function isInstrumentation(node: Node): boolean {
  if (node.nodeType !== NODE_ELEMENT) return false;
  const el = node as Element;
  if (el.hasAttribute("data-vs-overlay")) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "style" && (el.hasAttribute("data-vs-style") || el.hasAttribute("data-vs"))) return true;
  if (tag === "script" && el.hasAttribute("data-vs")) return true;
  return false;
}

/**
 * Where a newly added DOM node belongs in its parent's CRDT child list: the number of *mapped*
 * siblings before it. Unmapped siblings (anything the page's own scripts injected) are skipped
 * rather than counted, so an overlay or a framework-injected node cannot shift the index.
 */
function domIndexOf(parent: Element, node: Node, yFor: WeakMap<Node, YNode>): number {
  let index = 0;
  for (const child of Array.from(parent.childNodes)) {
    if (child === node) return index;
    if (yFor.get(child)) index += 1;
  }
  return -1;
}

/** Build a CRDT node from a DOM node, mapping it and its subtree as it goes. */
function toY(
  node: Node,
  link: (y: YNode, node: Node) => void,
  document: Doc,
  rescuedFmt?: WeakMap<Node, string>,
): YNode | null {
  if (node.nodeType === NODE_TEXT) {
    const text = new Y.XmlText();
    text.insert(0, (node as Text).data);
    link(text, node);
    return text;
  }
  if (node.nodeType === NODE_COMMENT) {
    const el = new Y.XmlElement(COMMENT_NODE);
    el.setAttribute(RAW_ATTR, (node as Comment).data);
    link(el, node);
    return el;
  }
  if (node.nodeType !== NODE_ELEMENT) return null;
  const source = node as Element;
  const el = new Y.XmlElement(source.tagName.toLowerCase());
  // A moved element keeps the formatting it had before the move, so the diff shows the move alone.
  const fmt = rescuedFmt?.get(node);
  if (fmt !== undefined) el.setAttribute(FMT_ATTR, fmt);
  for (const attr of Array.from(source.attributes)) {
    if (isInstrumentationAttr(attr.name)) continue;
    el.setAttribute(attr.name, attr.value);
  }
  link(el, node);
  const children: YNode[] = [];
  for (const child of Array.from(source.childNodes)) {
    const built = toY(child, link, document, rescuedFmt);
    if (built) children.push(built);
  }
  if (children.length > 0) el.insert(0, children as never);
  return el;
}

function textOf(text: Y.XmlText): string {
  let out = "";
  for (const op of text.toDelta() as Array<{ insert?: unknown }>) {
    if (typeof op.insert === "string") out += op.insert;
  }
  return out;
}
