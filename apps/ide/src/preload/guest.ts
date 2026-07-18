/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { ipcRenderer } from "electron";
import {
  INSPECTOR_BRIDGE_CHANNEL,
  bridgeCommandSchema,
  fingerprint,
  classSignature,
  emptyStyleOverride,
  mergeStyle,
  restorePlan,
  emptyClassOverride,
  mergeClass,
  type BridgeCommand,
  type BridgeEvent,
  type BridgeNode,
  type BridgeTree,
  type FpSeg,
  type StyleOverride,
  type ClassOverride,
  type NodeReadout,
  type Rect,
  type InsertTargetWire,
  type StructureSnapshotWire,
  type StructureNodeWire,
} from "@vortspec/core/inspector-bridge";
import { resolveInsertTarget, placeholderSizing, type FlowAxis } from "@vortspec/core/insert-geometry";
import { buildStructuralModel, slotAt, type StructuralNode, type Slot } from "@vortspec/core/structure-model";

/**
 * Run-Canvas inspector bridge — guest preload (change: run-canvas-visual-editor).
 *
 * Injected into the project's dev-server page inside the Run-Canvas <webview>.
 * It reads the already-rendered DOM (no cooperation from the user's app), streams
 * a node tree + per-element readouts to the host renderer, keeps the selected
 * node's geometry aligned, and applies ephemeral inline-style overrides for
 * instant visual feedback (nothing is ever written to disk from here). Host⇄guest
 * messages ride a single channel and are zod-validated on receipt (design D4).
 */

/** Computed-style properties the Design panel's sections consume. */
const STYLE_PROPS = [
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "width",
  "height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-top-width",
  "border-top-color",
  "border-top-style",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "opacity",
  "box-shadow",
  "filter",
  "mix-blend-mode",
  "visibility",
  "transform",
] as const;

const MAX_NODES = 3000;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "NOSCRIPT", "BR"]);

// ── Stable node identity (Run-Canvas hardening Phase 1) ────────────────────────
// Node ids are opaque, per-element uids minted ONCE and reused across scans — not
// array indices — so an id keeps pointing at the same logical element even when an
// HMR re-render replaces the element object. A uid survives a re-render two ways:
// the same Element object still carries it (WeakMap), or a re-render that replaced
// the element re-acquires the old uid by matching the element's structural
// fingerprint. All command handlers resolve ids through `resolve(id)`.
/** Stable per-element uid (minted once, reused). This is the node id. */
const uidOf = new WeakMap<Element, string>();
/** uid → its current Element, rebuilt each scan. Resolves a node id back to a live element. */
let byId = new Map<string, Element>();
/** fingerprint → uid from the last scan — re-acquires a uid after a re-render swaps the element. */
let fpToUid = new Map<string, string>();
let uidSeq = 0;
// Ephemeral edits are keyed by the stable uid (Phase 2), not the element object, so
// they re-apply to the element a re-render hands us in its place. The bookkeeping
// (merge/restore semantics) lives in the pure, unit-tested `override-store`.
/** Ephemeral inline-style overrides, keyed by node uid. */
const overrides = new Map<string, StyleOverride>();
/** Ephemeral class swaps, keyed by node uid: classes we added / removed for a variant preview. */
const classOverrides = new Map<string, ClassOverride>();
/** Ephemeral inline text edits, keyed by node uid (survive a re-render until persisted). */
const textOverrides = new Map<string, { applied: string; original: string }>();
let selectedId: string | null = null;
/** Input mode: `interact` (default) lets the app work; `inspect` intercepts hover/click to
 *  select; `comment` pins a thread; `insert` hit-tests gaps to place a composition slot. */
let mode: "inspect" | "interact" | "comment" | "insert" = "interact";

// ── Insert mode (change: canvas-compose-and-preview-bar) ───────────────────────
// An ephemeral placeholder injected into the page so the user sees the slot they
// are about to fill, at its true size, in real layout. It writes NOTHING to disk.
// It carries `data-vs-overlay` so the tree scan and future hit-tests skip it, and
// `pointer-events: none` so it never eats the pointer. Its anchor is remembered by
// fingerprint so it can be re-established across an HMR re-render.
/** The live placeholder element, or null when none is placed. */
let placeholder: HTMLElement | null = null;
/** The slot the placeholder holds (anchor fingerprint + before/after + axis + line). */
let placeholderTarget: InsertTargetWire | null = null;
/** The user's soft size hint from edge-drag resize (px), re-applied across re-renders. */
let placeholderSize: { width?: number; height?: number } = {};
/** The option index currently previewed in place, or null to show all written options. */
let previewedOption: number | null = null;
/** A persistent <style> in <head> that hides the non-previewed options (survives HMR). */
let previewStyleEl: HTMLStyleElement | null = null;

/** Show only `[data-vs-option="<previewedOption>"]`; null clears the filter. */
function applyOptionPreview(): void {
  if (previewedOption === null) {
    previewStyleEl?.remove();
    previewStyleEl = null;
    return;
  }
  if (!previewStyleEl || !previewStyleEl.isConnected) {
    previewStyleEl = document.createElement("style");
    previewStyleEl.setAttribute("data-vs-overlay", "");
    document.head.appendChild(previewStyleEl);
  }
  previewStyleEl.textContent = `[data-vs-option]:not([data-vs-option="${previewedOption}"]){display:none !important;}`;
}

function send(event: BridgeEvent): void {
  ipcRenderer.sendToHost(INSPECTOR_BRIDGE_CHANNEL, event);
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function classesOf(el: Element): string[] {
  // Drop framework hash-y classes (long, no vowels-ish) to keep labels readable.
  return Array.from(el.classList)
    .filter((c) => c.length <= 24 && !/^[a-z]+-[a-z0-9]{6,}$/i.test(c))
    .slice(0, 4);
}

function nodeOf(el: Element, id: string): BridgeNode {
  const dataComponent = el.getAttribute("data-component") ?? undefined;
  const node: BridgeNode = {
    id,
    tag: el.tagName.toLowerCase(),
    classes: classesOf(el),
    childCount: Array.from(el.children).filter((c) => !SKIP_TAGS.has(c.tagName)).length,
  };
  const idAttr = el.getAttribute("id");
  if (idAttr) node.idAttr = idAttr;
  const role = el.getAttribute("role");
  if (role) node.role = role;
  if (dataComponent) node.component = dataComponent;
  return node;
}

/** Resolve a node id to its current live Element (post-scan), or undefined if it's gone. */
function resolve(id: string): Element | undefined {
  return byId.get(id);
}

/** 1-based position of `el` among its same-tag siblings (structural anchor). */
function nthOfType(el: Element): number {
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) n++;
    sib = sib.previousElementSibling;
  }
  return n;
}

/**
 * A serializable structural fingerprint for `el`: the tag + nth-of-type chain from
 * the nearest ancestor with a stable id/`data-component` (or body) down to the
 * element, plus each segment's id / component / role / class signature. Survives an
 * HMR re-render that reproduces the same DOM shape with fresh element objects.
 */
function fingerprintFor(el: Element): string {
  const segs: FpSeg[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur !== document.body && depth < 12) {
    const idAttr = cur.getAttribute("id") ?? undefined;
    const component = cur.getAttribute("data-component") ?? undefined;
    const role = cur.getAttribute("role") ?? undefined;
    const classSig = classSignature(Array.from(cur.classList));
    segs.unshift({
      tag: cur.tagName.toLowerCase(),
      ...(idAttr ? { id: idAttr } : {}),
      ...(component ? { component } : {}),
      ...(role ? { role } : {}),
      ...(classSig ? { classSig } : {}),
      nth: nthOfType(cur),
    });
    if (idAttr || component) break; // a stable ancestor anchors the path — stop climbing
    cur = cur.parentElement;
    depth++;
  }
  return fingerprint(segs);
}

/** Walk the rendered DOM into a flat BridgeTree, (re)building the id↔Element maps. */
function buildTree(): BridgeTree {
  byId = new Map<string, Element>();
  const nextFpToUid = new Map<string, string>();
  const nodes: Record<string, BridgeNode> = {};
  const children: Record<string, string[]> = {};
  const roots: string[] = [];
  let count = 0;

  const idFor = (el: Element): string => {
    const fp = fingerprintFor(el);
    // Same element object → same uid; a re-render that replaced it → re-acquire the
    // old uid by fingerprint (unless already claimed this scan); else mint a fresh one.
    let uid = uidOf.get(el);
    if (!uid) {
      const reacquired = fpToUid.get(fp);
      uid = reacquired && !byId.has(reacquired) ? reacquired : `n${uidSeq++}`;
    }
    // Guarantee a 1:1 uid↔element map within a scan: if this uid was already claimed
    // by a coexisting element (a rare fingerprint collision between a survivor and a
    // reacquired element), mint a fresh one so the two never share an id.
    if (byId.has(uid)) uid = `n${uidSeq++}`;
    uidOf.set(el, uid);
    byId.set(uid, el);
    nextFpToUid.set(fp, uid);
    return uid;
  };

  const root = document.body;
  if (!root) {
    fpToUid = nextFpToUid;
    return { roots, nodes, children };
  }

  const walk = (el: Element, parentId: string | null): void => {
    if (count >= MAX_NODES || SKIP_TAGS.has(el.tagName)) return;
    if (el.hasAttribute("data-vs-overlay")) return; // never inspect our own chrome
    count++;
    const id = idFor(el);
    nodes[id] = nodeOf(el, id);
    if (parentId === null) roots.push(id);
    else (children[parentId] ??= []).push(id);
    for (const child of Array.from(el.children)) walk(child, id);
  };

  for (const child of Array.from(root.children)) walk(child, null);
  fpToUid = nextFpToUid;
  return { roots, nodes, children };
}

function readoutOf(el: Element, id: string): NodeReadout {
  const cs = getComputedStyle(el);
  const computed: Record<string, string> = {};
  for (const prop of STYLE_PROPS) {
    const v = cs.getPropertyValue(prop);
    if (v) computed[prop] = v.trim();
  }
  // Custom properties (design tokens) resolved in this element's scope.
  const customProps: Record<string, string> = {};
  for (let i = 0; i < cs.length; i++) {
    const name = cs.item(i);
    if (name.startsWith("--")) {
      const v = cs.getPropertyValue(name);
      if (v) customProps[name] = v.trim();
    }
  }
  return {
    nodeId: id,
    rect: rectOf(el),
    computed,
    customProps,
    dataComponent: el.getAttribute("data-component"),
    className: typeof el.className === "string" ? el.className : "",
    children: Array.from(el.children)
      .filter((c) => !SKIP_TAGS.has(c.tagName) && !c.hasAttribute("data-vs-overlay"))
      .map((c) => rectOf(c)),
    text: textLeaf(el),
  };
}

/** A genuine text leaf: an element with text but no (non-skipped) element children. */
function isTextLeaf(el: Element): boolean {
  return !Array.from(el.children).some((c) => !SKIP_TAGS.has(c.tagName));
}

/** The element's visible text when it is a text leaf, else undefined. */
function textLeaf(el: Element): string | undefined {
  if (!isTextLeaf(el)) return undefined;
  const t = (el.textContent ?? "").trim();
  return t ? t.slice(0, 2000) : undefined;
}

/** Set an element's text as an ephemeral edit, capturing the original once (for restore). */
function setTextOverride(id: string, el: Element, text: string): void {
  let t = textOverrides.get(id);
  if (!t) textOverrides.set(id, (t = { applied: text, original: el.textContent ?? "" }));
  else t.applied = text;
  el.textContent = text;
}

function applyOverride(id: string, css: Record<string, string>): void {
  const el = resolve(id) as HTMLElement | undefined;
  if (!el || !("style" in el)) return;
  let o = overrides.get(id);
  if (!o) overrides.set(id, (o = emptyStyleOverride()));
  mergeStyle(o, css, (prop) => el.style.getPropertyValue(prop));
  for (const [prop, value] of Object.entries(css)) el.style.setProperty(prop, value);
}

/** Restore an element to its pre-override inline state and forget the override. */
function restoreOverride(id: string): void {
  const el = resolve(id) as HTMLElement | undefined;
  const o = overrides.get(id);
  if (o && el) {
    for (const [prop, value] of Object.entries(restorePlan(o))) {
      if (value === null) el.style.removeProperty(prop);
      else el.style.setProperty(prop, value);
    }
  }
  overrides.delete(id);
  const cls = classOverrides.get(id);
  if (cls && el) {
    for (const c of cls.add) el.classList.remove(c);
    for (const c of cls.remove) el.classList.add(c);
  }
  classOverrides.delete(id);
  const txt = textOverrides.get(id);
  if (txt && el && isTextLeaf(el)) el.textContent = txt.original;
  textOverrides.delete(id);
}

function clearOverride(id?: string): void {
  if (id !== undefined) {
    restoreOverride(id);
  } else {
    for (const key of new Set([...overrides.keys(), ...classOverrides.keys(), ...textOverrides.keys()]))
      restoreOverride(key);
  }
}

/** Re-apply every ephemeral edit to the elements the current scan resolved (Phase 2/4). */
function reapplyOverrides(): void {
  for (const [id, o] of overrides) {
    const el = resolve(id) as HTMLElement | undefined;
    if (el) for (const [prop, value] of Object.entries(o.applied)) el.style.setProperty(prop, value);
  }
  for (const [id, cls] of classOverrides) {
    const el = resolve(id);
    if (el) {
      for (const c of cls.remove) el.classList.remove(c);
      for (const c of cls.add) el.classList.add(c);
    }
  }
  // A re-render reverts our ephemeral text — re-apply it (only to a still-valid leaf)
  // so the pending edit doesn't silently vanish before the user persists it.
  for (const [id, t] of textOverrides) {
    const el = resolve(id);
    if (el && isTextLeaf(el) && (el.textContent ?? "") !== t.applied) el.textContent = t.applied;
  }
}

function emitGeometry(id: string): void {
  const el = resolve(id);
  if (el) send({ t: "geometry", nodeId: id, rect: rectOf(el) });
}

// ── Comment anchors (change: run-canvas-comments, Phase 2) ─────────────────────
/** Fingerprints of pinned comments we resolve to live rects for the overlay. */
let watchedFingerprints: string[] = [];

/** Resolve a stored anchor fingerprint to its current element (via the last scan). */
function resolveFingerprint(fp: string): Element | undefined {
  const uid = fpToUid.get(fp);
  return uid ? byId.get(uid) : undefined;
}

/** A human label for an element — its component name, else tag + an id/class hint. */
function labelFor(el: Element): string {
  const base = el.getAttribute("data-component") ?? el.tagName.toLowerCase();
  const idAttr = el.getAttribute("id");
  const cls = classesOf(el)[0];
  return idAttr ? `${base} #${idAttr}` : cls ? `${base} .${cls}` : base;
}

/** Stream the live rect of every watched anchor (null = its element is currently gone). */
function emitAnchorRects(): void {
  if (watchedFingerprints.length === 0) return;
  const rects: Record<string, ReturnType<typeof rectOf> | null> = {};
  for (const fp of watchedFingerprints) {
    const el = resolveFingerprint(fp);
    rects[fp] = el ? rectOf(el) : null;
  }
  send({ t: "anchorRects", rects });
}

/**
 * Rescan the DOM (re-acquiring uids by fingerprint), rebroadcast the tree, and
 * re-lock the selection: if the selected node re-acquired a live element, echo its
 * fresh readout + geometry so its overlay stays put; if it's truly gone, tell the
 * host the selection was lost so it can clear it cleanly. Called (debounced) when a
 * re-render mutates the DOM out from under us.
 */
function rebuildAndReacquire(): void {
  send({ t: "tree", tree: buildTree() });
  reapplyOverrides(); // a re-render reset the DOM — re-paint our ephemeral edits
  emitAnchorRects(); // pins re-resolve to their (possibly moved) elements
  reacquirePlaceholder(); // a re-render drops our injected placeholder — re-establish it
  reacquireDrag(); // a mid-drag HMR patch invalidates every rect — re-lock or cancel (Decision 8)
  reapplyLiveMove(); // an app re-render may undo an ephemeral move — re-apply it until Keep reloads
  applyOptionPreview(); // keep the one-option preview filter attached across re-renders
  if (!selectedId) return;
  const el = resolve(selectedId);
  if (el) {
    send({ t: "readout", readout: readoutOf(el, selectedId) });
    send({ t: "geometry", nodeId: selectedId, rect: rectOf(el) });
  } else {
    send({ t: "selectionLost", nodeId: selectedId });
    selectedId = null;
  }
}

/** Coalesce mutation storms (an HMR patch fires many records) into one rebuild. */
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRebuild(): void {
  if (rebuildTimer !== null) return;
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    rebuildAndReacquire();
  }, 150);
}

// ── Structure snapshot (change: canvas-live-structural-editing) ────────────────

/** The layout-computed subset the structure model needs, per element. */
function layoutComputed(el: Element): Record<string, string> {
  const cs = getComputedStyle(el);
  return {
    display: cs.display,
    "flex-direction": cs.flexDirection,
    "grid-auto-flow": cs.gridAutoFlow,
    gap: cs.gap,
  };
}

/** A stable id for an element in the structure scan — reuse its tree uid, else mint one. */
function structureIdOf(el: Element): string {
  let uid = uidOf.get(el);
  if (!uid) {
    uid = `n${uidSeq++}`;
    uidOf.set(el, uid);
  }
  return uid;
}

/** id → live element for the most recent structure snapshot (drag targeting resolves slots through it). */
const structureEls = new Map<string, Element>();

/** Serialize a subtree (rect + computed flow + child ids per element) for the host model. */
function buildStructureSnapshot(rootEl: Element): StructureSnapshotWire {
  const nodes: Record<string, StructureNodeWire> = {};
  structureEls.clear();
  const walk = (el: Element): string => {
    const id = structureIdOf(el);
    structureEls.set(id, el);
    const kids = childElementsOf(el);
    nodes[id] = {
      id,
      fingerprint: fingerprintFor(el),
      rect: rectOf(el),
      computed: layoutComputed(el),
      childIds: kids.map(structureIdOf),
    };
    for (const k of kids) walk(k);
    return id;
  };
  return { rootId: walk(rootEl), nodes };
}

// ── Drag-move gesture (change: canvas-live-structural-editing, §5.2–5.3) ────────

/** How far the pointer must travel from the press point before a click becomes a drag. */
const DRAG_THRESHOLD = 4;
/** A press on the selected element, armed but not yet past the movement threshold. */
let dragArm: { id: string; el: Element; startX: number; startY: number; grabX: number; grabY: number } | null = null;
/** The live drag: the dragged element, its fingerprint, the cached structural model, and the grab offset. */
let dragging: {
  id: string;
  el: Element;
  fp: string;
  model: StructuralNode | null;
  grabX: number;
  grabY: number;
  rect: Rect;
} | null = null;

/** Resolve a structural slot to the host wire shape PLUS the live anchor element it targets. */
function slotResolve(slot: Slot): { wire: InsertTargetWire; anchorEl: Element } | null {
  const anchorEl = structureEls.get(slot.anchorId);
  if (!anchorEl?.isConnected) return null;
  return {
    anchorEl,
    wire: {
      anchorFingerprint: fingerprintFor(anchorEl),
      position: slot.position,
      axis: slot.axis,
      line: slot.line,
      anchorLabel: labelFor(anchorEl),
      anchorText: (anchorEl.textContent ?? "").trim().slice(0, 160) || null,
    },
  };
}

/** Arm a potential drag when the user presses the already-selected element (Decision 3). */
function armDrag(id: string, el: Element, x: number, y: number): void {
  const r = rectOf(el);
  dragArm = { id, el, startX: x, startY: y, grabX: x - r.x, grabY: y - r.y };
}

/** Cross the movement threshold → begin the drag: cache the structural model, tell the host. */
function beginDrag(): void {
  const arm = dragArm;
  dragArm = null;
  if (!arm || !arm.el.isConnected) return;
  const model = buildStructuralModel(buildStructureSnapshot(document.body));
  dragging = { id: arm.id, el: arm.el, fp: fingerprintFor(arm.el), model, grabX: arm.grabX, grabY: arm.grabY, rect: rectOf(arm.el) };
  send({ t: "dragStart", sourceFingerprint: dragging.fp, nodeId: dragging.id, rect: dragging.rect });
}

/** Resolve the drop slot under the pointer (excluding the dragged subtree; Alt = pop out one level). */
function dragSlotUnder(x: number, y: number, popOut: boolean): { wire: InsertTargetWire; anchorEl: Element } | null {
  if (!dragging?.model) return null;
  const slot = slotAt(dragging.model, { x, y }, { excludeSubtree: [dragging.id], popOut: popOut ? 1 : 0 });
  return slot ? slotResolve(slot) : null;
}

/** Per-frame drag update: current slot + the ghost rect trailing the pointer (one event/rAF). */
function updateDrag(x: number, y: number, alt: boolean): void {
  if (!dragging) return;
  const ghost = { x: x - dragging.grabX, y: y - dragging.grabY, width: dragging.rect.width, height: dragging.rect.height };
  send({ t: "dragTarget", target: dragSlotUnder(x, y, alt)?.wire ?? null, ghost, poppedOut: alt });
}

/**
 * An ephemeral live-DOM move awaiting Keep/Revert (change: canvas-direct-manipulation-move).
 * Live element refs (valid through the review window — HMR only fires on a file save,
 * which won't happen while the user decides); re-acquired best-effort after a re-render.
 */
let movedEl: {
  el: Element;
  originParent: Element | null;
  originNext: Element | null;
  targetFp: string;
  position: "before" | "after";
} | null = null;

/** Insert `el` before/after the anchor element (via the anchor's parent). */
function placeRelative(el: Element, anchor: Element, position: "before" | "after"): void {
  const parent = anchor.parentElement;
  if (!parent) return;
  parent.insertBefore(el, position === "before" ? anchor : anchor.nextSibling);
}

/** Perform the instant reparent on a valid drop; remember origin + target for revert/reapply. */
function applyLiveMove(el: Element, anchor: Element, position: "before" | "after"): void {
  // Never move into self/own descendant, or where it already sits.
  if (!anchor.parentElement || anchor === el || el.contains(anchor)) return;
  const already = position === "before" ? anchor.previousElementSibling === el : anchor.nextElementSibling === el;
  movedEl = {
    el,
    originParent: el.parentElement,
    originNext: el.nextElementSibling,
    targetFp: fingerprintFor(anchor),
    position,
  };
  if (!already) placeRelative(el, anchor, position);
}

/** Undo the ephemeral move — re-insert the element at its origin. Idempotent. */
function revertLiveMove(): void {
  const m = movedEl;
  movedEl = null;
  if (!m || !m.el.isConnected) return;
  if (m.originParent?.isConnected) {
    m.originParent.insertBefore(m.el, m.originNext?.isConnected ? m.originNext : null);
  }
}

/** Re-apply the ephemeral move after an app re-render put the element back (Decision 8 sibling). */
function reapplyLiveMove(): void {
  if (!movedEl?.el.isConnected) return;
  const anchor = resolveFingerprint(movedEl.targetFp);
  if (anchor && anchor !== movedEl.el && anchor.parentElement) placeRelative(movedEl.el, anchor, movedEl.position);
}

/** Finish the drag (pointerup): move the element live NOW, emit the drop, then clear the drag. */
function dropDrag(x: number, y: number, alt: boolean): void {
  if (!dragging) return;
  const resolved = dragSlotUnder(x, y, alt);
  // Instant feedback: reparent the real element into the slot before any agent runs,
  // using the live anchor element we already have (no lossy fingerprint round-trip).
  if (resolved) applyLiveMove(dragging.el, resolved.anchorEl, resolved.wire.position);
  send({ t: "dragDrop", sourceFingerprint: dragging.fp, target: resolved?.wire ?? null, poppedOut: alt });
  dragging = null;
}

/** Abandon the drag (Escape / host cancel / lost element). `message` set only on a forced cancel. */
function cancelDrag(message: string | null): void {
  dragArm = null;
  if (!dragging) return;
  dragging = null;
  send({ t: "dragCancel", message });
}

/**
 * Re-acquire the dragged element after a mid-drag DOM mutation (HMR patch, Decision 8):
 * rebuild the structural model against the fresh DOM and re-lock the dragged element by
 * fingerprint. If it can't be re-acquired, cancel with a human sentence rather than
 * hit-testing stale rects.
 */
function reacquireDrag(): void {
  if (!dragging) return;
  const el = resolveFingerprint(dragging.fp);
  if (!el?.isConnected) {
    cancelDrag("Lost the element after a live reload — select it and drag again.");
    return;
  }
  dragging.el = el;
  dragging.rect = rectOf(el);
  dragging.id = structureIdOf(el);
  dragging.model = buildStructuralModel(buildStructureSnapshot(document.body));
}

// ── Insert-mode geometry + placeholder (change: canvas-compose-and-preview-bar) ─

/** An element's inspectable element children (skipping chrome and our own overlay). */
function childElementsOf(el: Element): Element[] {
  return Array.from(el.children).filter((c) => !SKIP_TAGS.has(c.tagName) && !c.hasAttribute("data-vs-overlay"));
}

/**
 * The container whose children we insert among, under a point. A gap between
 * siblings hit-tests to the container itself (the gap is its background), so when
 * the point lands on an element that HAS children we treat it as the container;
 * otherwise the point is over a leaf and its parent is the container.
 */
function containerAndChildren(x: number, y: number): { container: Element; childEls: Element[] } | null {
  let el = document.elementFromPoint(x, y) as Element | null;
  while (el && el.hasAttribute("data-vs-overlay")) el = el.parentElement; // skip our own chrome
  if (!el) return null;
  const own = childElementsOf(el);
  if (own.length >= 1) return { container: el, childEls: own };
  const parent = el.parentElement;
  if (!parent) return null;
  const sibs = childElementsOf(parent);
  return sibs.length ? { container: parent, childEls: sibs } : null;
}

/** Resolve the insertion slot under a point, with the anchor element to place against. */
function insertTargetUnder(
  x: number,
  y: number,
): { wire: InsertTargetWire; container: Element; anchorEl: Element } | null {
  const found = containerAndChildren(x, y);
  if (!found) return null;
  const cs = getComputedStyle(found.container);
  const computed = { display: cs.display, "flex-direction": cs.flexDirection, "grid-auto-flow": cs.gridAutoFlow };
  const target = resolveInsertTarget({ x, y }, { computed, children: found.childEls.map(rectOf) });
  if (!target) return null;
  const anchorEl = found.childEls[target.anchorIndex];
  if (!anchorEl) return null;
  return {
    wire: {
      anchorFingerprint: fingerprintFor(anchorEl),
      position: target.position,
      axis: target.axis,
      line: target.line,
      anchorLabel: labelFor(anchorEl),
      anchorText: (anchorEl.textContent ?? "").trim().slice(0, 160) || null,
    },
    container: found.container,
    anchorEl,
  };
}

/** The user's chosen layout for the placeholder (axis + how many sub-slots). */
let placeholderSpec: { axis: FlowAxis; slotCount: number } = { axis: "row", slotCount: 1 };

/** One dashed sub-slot cell inside a multi-slot placeholder. */
function makeSlotCell(label: string): HTMLElement {
  const cell = document.createElement("div");
  cell.textContent = label;
  cell.style.setProperty("flex", "1 1 0");
  cell.style.setProperty("min-width", "36px");
  cell.style.setProperty("min-height", "24px");
  cell.style.setProperty("display", "flex");
  cell.style.setProperty("align-items", "center");
  cell.style.setProperty("justify-content", "center");
  cell.style.setProperty("border", "1px dashed rgba(124,111,240,0.6)");
  cell.style.setProperty("border-radius", "6px");
  return cell;
}

/** Fill/refill the placeholder for a given axis + slot count. */
function fillPlaceholder(el: HTMLElement, axis: FlowAxis, slotCount: number): void {
  for (const [k, v] of Object.entries(placeholderSizing(axis))) el.style.setProperty(k, v);
  el.style.setProperty("box-sizing", "border-box");
  el.style.setProperty("display", "flex");
  el.style.setProperty("flex-direction", axis === "row" ? "row" : "column");
  el.style.setProperty("align-items", "stretch");
  el.style.setProperty("gap", "8px");
  el.style.setProperty("padding", "8px");
  el.style.setProperty("border", "2px dashed #7c6ff0");
  el.style.setProperty("border-radius", "8px");
  el.style.setProperty("background", "rgba(124,111,240,0.08)");
  el.style.setProperty("color", "#7c6ff0");
  el.style.setProperty("font", "12px system-ui, sans-serif");
  el.style.setProperty("pointer-events", "none");
  el.replaceChildren();
  const n = Math.max(1, slotCount);
  if (n === 1) {
    el.style.setProperty("align-items", "center");
    el.style.setProperty("justify-content", "center");
    el.style.setProperty("padding", "12px");
    el.textContent = "Compose here";
  } else {
    for (let i = 0; i < n; i++) el.appendChild(makeSlotCell(`Slot ${i + 1}`));
  }
}

/** Build the visible placeholder element, sized for the current spec. */
function makePlaceholderEl(axis: FlowAxis): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-vs-overlay", ""); // excluded from the tree scan and child rects
  el.setAttribute("data-vs-placeholder", "");
  fillPlaceholder(el, axis, placeholderSpec.slotCount);
  return el;
}

/** Apply the user's soft size hint; an explicit size overrides the implicit flex sizing. */
function applyPlaceholderSize(el: HTMLElement): void {
  if (placeholderSize.width !== undefined) {
    el.style.setProperty("width", `${placeholderSize.width}px`);
    el.style.setProperty("flex", "0 0 auto");
  }
  if (placeholderSize.height !== undefined) el.style.setProperty("height", `${placeholderSize.height}px`);
}

function insertPlaceholderAt(el: HTMLElement, container: Element, anchorEl: Element, position: "before" | "after"): void {
  if (position === "before") container.insertBefore(el, anchorEl);
  else container.insertBefore(el, anchorEl.nextSibling);
}

/** Materialize a placeholder at a slot and tell the host (nothing is written to disk). */
function materializePlaceholder(wire: InsertTargetWire, container: Element, anchorEl: Element): void {
  dismissPlaceholder();
  placeholderSpec = { axis: wire.axis, slotCount: 1 };
  const el = makePlaceholderEl(wire.axis);
  applyPlaceholderSize(el);
  insertPlaceholderAt(el, container, anchorEl, wire.position);
  placeholder = el;
  placeholderTarget = wire;
  send({ t: "insertTarget", target: null }); // the line gives way to the placeholder
  send({ t: "placeholderReady", target: wire, rect: rectOf(el) });
}

/** Resize the placeholder live; the size ships to the run as a hint, not a constraint. */
function resizePlaceholder(width?: number, height?: number): void {
  if (!placeholder || !placeholderTarget) return;
  placeholderSize = { width, height };
  applyPlaceholderSize(placeholder);
  send({ t: "placeholderReady", target: placeholderTarget, rect: rectOf(placeholder) });
}

/** Re-render the placeholder to a chosen axis + slot count (the user's layout choice). */
function setPlaceholderSpec(axis: FlowAxis, slotCount: number): void {
  if (!placeholder || !placeholderTarget) return;
  placeholderSpec = { axis, slotCount };
  placeholderTarget = { ...placeholderTarget, axis };
  fillPlaceholder(placeholder, axis, slotCount);
  applyPlaceholderSize(placeholder);
  send({ t: "placeholderReady", target: placeholderTarget, rect: rectOf(placeholder) });
}

/** Remove the placeholder and forget its slot. Idempotent. */
function dismissPlaceholder(): void {
  placeholder?.parentElement?.removeChild(placeholder);
  placeholder = null;
  placeholderTarget = null;
  placeholderSize = {};
  placeholderSpec = { axis: "row", slotCount: 1 };
}

/**
 * Re-establish the placeholder after an HMR re-render replaced the DOM. If it
 * survived (still connected), just re-echo its rect; otherwise re-acquire the
 * anchor by fingerprint and re-insert. If the anchor is gone, dismiss with a human
 * sentence — never reattach to the wrong element.
 */
function reacquirePlaceholder(): void {
  if (!placeholderTarget) return;
  if (placeholder?.isConnected) {
    send({ t: "placeholderReady", target: placeholderTarget, rect: rectOf(placeholder) });
    return;
  }
  const anchorEl = resolveFingerprint(placeholderTarget.anchorFingerprint);
  if (!anchorEl?.parentElement) {
    dismissPlaceholder();
    send({
      t: "placeholderLost",
      message: "The spot you were composing into changed after a reload — pick the spot again.",
    });
    return;
  }
  const el = placeholder ?? makePlaceholderEl(placeholderTarget.axis);
  applyPlaceholderSize(el);
  insertPlaceholderAt(el, anchorEl.parentElement, anchorEl, placeholderTarget.position);
  placeholder = el;
  send({ t: "placeholderReady", target: placeholderTarget, rect: rectOf(el) });
}

function handleCommand(cmd: BridgeCommand): void {
  switch (cmd.t) {
    case "requestTree":
      send({ t: "tree", tree: buildTree() });
      return;
    case "selectNode": {
      selectedId = cmd.nodeId;
      const el = resolve(cmd.nodeId);
      if (el) send({ t: "readout", readout: readoutOf(el, cmd.nodeId) });
      return;
    }
    case "hoverNode":
      if (cmd.nodeId !== null) emitGeometry(cmd.nodeId);
      return;
    case "setMode":
      // Leaving insert mode tears down its ephemeral affordances.
      if (mode === "insert" && cmd.mode !== "insert") {
        dismissPlaceholder();
        send({ t: "insertTarget", target: null });
      }
      // Drag lives inside inspect mode — leaving it abandons any drag (Decision 3)
      // and reverts an unconfirmed ephemeral move (nothing was written).
      if (cmd.mode !== "inspect") {
        dragArm = null;
        dragging = null;
        revertLiveMove();
      }
      mode = cmd.mode;
      return;
    case "applyOverride":
      applyOverride(cmd.nodeId, cmd.css);
      emitGeometry(cmd.nodeId);
      return;
    case "clearOverride":
      clearOverride(cmd.nodeId);
      if (selectedId) emitGeometry(selectedId);
      return;
    case "setText": {
      const el = resolve(cmd.nodeId);
      // Only ever rewrite genuine text leaves — never clobber an element that has
      // formatted children (that would drop them and fight the framework's VDOM).
      if (el && isTextLeaf(el)) {
        setTextOverride(cmd.nodeId, el, cmd.text);
        emitGeometry(cmd.nodeId);
      }
      return;
    }
    case "setClass": {
      const el = resolve(cmd.nodeId);
      if (el) {
        let c = classOverrides.get(cmd.nodeId);
        if (!c) classOverrides.set(cmd.nodeId, (c = emptyClassOverride()));
        mergeClass(c, cmd.remove, cmd.add);
        for (const name of cmd.remove) if (name) el.classList.remove(name);
        for (const name of cmd.add) if (name) el.classList.add(name);
        emitGeometry(cmd.nodeId);
      }
      return;
    }
    case "watchAnchors":
      watchedFingerprints = cmd.fingerprints;
      // Emit even when empty so the host clears stale pin rects (the last thread removed).
      if (watchedFingerprints.length === 0) send({ t: "anchorRects", rects: {} });
      else emitAnchorRects();
      return;
    case "scrollToAnchor": {
      const el = resolveFingerprint(cmd.fingerprint);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "center" });
        emitAnchorRects(); // pins re-align after the scroll
      }
      return;
    }
    case "createPlaceholder": {
      // Host-initiated placement — re-acquire the anchor by fingerprint.
      const anchorEl = resolveFingerprint(cmd.target.anchorFingerprint);
      if (anchorEl?.parentElement) materializePlaceholder(cmd.target, anchorEl.parentElement, anchorEl);
      return;
    }
    case "resizePlaceholder":
      resizePlaceholder(cmd.width, cmd.height);
      return;
    case "dismissPlaceholder":
      dismissPlaceholder();
      send({ t: "insertTarget", target: null });
      return;
    case "setPlaceholderSpec":
      setPlaceholderSpec(cmd.axis, cmd.slotCount);
      return;
    case "previewOption":
      previewedOption = cmd.option;
      applyOptionPreview();
      return;
    case "requestStructure": {
      const rootEl = cmd.nodeId ? resolve(cmd.nodeId) : document.body;
      if (rootEl) send({ t: "structure", snapshot: buildStructureSnapshot(rootEl) });
      return;
    }
    case "cancelDrag":
      // Host-initiated abort (the move panel closed) — tear down without an event.
      dragArm = null;
      dragging = null;
      return;
    case "revertMove":
      revertLiveMove();
      return;
    case "clearMove":
      // Keep reloaded real source — forget the ephemeral move (no DOM change).
      movedEl = null;
      return;
  }
}

function attach(): void {
  ipcRenderer.on(INSPECTOR_BRIDGE_CHANNEL, (_e, raw) => {
    const parsed = bridgeCommandSchema.safeParse(raw);
    if (parsed.success) handleCommand(parsed.data);
  });

  // ── Inspect mode: hit-test the pointer and intercept clicks to select ──────
  // Walk up to the nearest ancestor that is in the current tree (its uid still
  // resolves to it), so stale uids from before a re-render never match.
  const idUnder = (target: EventTarget | null): string | null => {
    let el = target as Element | null;
    while (el) {
      const uid = uidOf.get(el);
      if (uid && byId.get(uid) === el) return uid;
      el = el.parentElement;
    }
    return null;
  };
  let rafPending = false;
  let lastHover: string | null = null;
  window.addEventListener(
    "pointermove",
    (e: PointerEvent) => {
      // Hover feedback in inspect/comment (the target element) and insert (the slot).
      if (mode !== "inspect" && mode !== "comment" && mode !== "insert") return;
      if (rafPending) return;
      rafPending = true;
      const { clientX, clientY, target, altKey } = e;
      requestAnimationFrame(() => {
        rafPending = false;
        // Drag-move takes precedence in inspect mode (Decision 3): an armed press
        // that moves past the threshold begins the drag; a live drag streams its
        // slot + ghost (one dragTarget per rAF — Decision 8).
        if (dragging) {
          updateDrag(clientX, clientY, altKey);
          return;
        }
        if (dragArm && mode === "inspect") {
          if (Math.hypot(clientX - dragArm.startX, clientY - dragArm.startY) >= DRAG_THRESHOLD) {
            beginDrag();
            updateDrag(clientX, clientY, altKey);
          }
          return;
        }
        if (mode === "insert") {
          // Once a placeholder is placed the user is sizing/prompting — stop retargeting.
          if (placeholder) return;
          const t = insertTargetUnder(clientX, clientY);
          send({ t: "insertTarget", target: t ? t.wire : null });
          return;
        }
        const id = idUnder(target);
        if (id === lastHover) return;
        lastHover = id;
        const el = id ? resolve(id) : null;
        send({ t: "hovered", nodeId: id, rect: el ? rectOf(el) : undefined });
      });
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      if (mode === "insert") {
        if (placeholder) return; // already placed; ignore until dismissed
        const t = insertTargetUnder(e.clientX, e.clientY);
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        materializePlaceholder(t.wire, t.container, t.anchorEl);
        return;
      }
      if (mode !== "inspect" && mode !== "comment") return;
      const id = idUnder(e.target);
      if (id === null) return;
      e.preventDefault();
      e.stopPropagation();
      const el = resolve(id);
      if (!el) return;
      if (mode === "comment") {
        // Anchor a new comment to this element (fingerprint re-locates it later).
        send({
          t: "commentTarget",
          nodeId: id,
          fingerprint: fingerprintFor(el),
          label: labelFor(el),
          component: el.getAttribute("data-component"),
          rect: rectOf(el),
        });
        return;
      }
      // Pressing the already-selected element arms a drag (select-then-move; Decision 3).
      if (id === selectedId) armDrag(id, el, e.clientX, e.clientY);
      selectedId = id;
      send({ t: "readout", readout: readoutOf(el, id) });
    },
    { capture: true },
  );
  // End (or abandon) a drag on release. A press that never moved past the threshold
  // was just a click — drop the arm and let selection stand.
  window.addEventListener(
    "pointerup",
    (e: PointerEvent) => {
      if (dragging) {
        e.preventDefault();
        e.stopPropagation();
        dropDrag(e.clientX, e.clientY, e.altKey);
      }
      dragArm = null;
    },
    { capture: true },
  );
  // Escape abandons an in-flight drag (plain cancel — no forced-loss message).
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && (dragging || dragArm)) {
        e.preventDefault();
        cancelDrag(null);
      }
    },
    { capture: true },
  );
  // Swallow the follow-up click so an inspected/commented/insert control doesn't also activate.
  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      if (mode === "insert") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (mode !== "inspect" && mode !== "comment") return;
      if (idUnder(e.target) !== null) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true },
  );

  // Right-click an element in inspect mode → select it and ask the host to open
  // its context menu (Send to chat, etc.) at the cursor.
  window.addEventListener(
    "contextmenu",
    (e: MouseEvent) => {
      if (mode !== "inspect") return;
      const id = idUnder(e.target);
      if (id === null) return;
      e.preventDefault();
      e.stopPropagation();
      selectedId = id;
      const el = resolve(id);
      if (el) send({ t: "readout", readout: readoutOf(el, id) });
      send({ t: "contextMenu", nodeId: id, x: e.clientX, y: e.clientY });
    },
    { capture: true },
  );

  // Double-click a text leaf to edit its content inline; commit on blur / Enter.
  window.addEventListener(
    "dblclick",
    (e: MouseEvent) => {
      if (mode !== "inspect") return;
      const id = idUnder(e.target);
      if (id === null) return;
      const el = resolve(id) as HTMLElement | undefined;
      // Only genuine text leaves are editable; double-clicking anything else is an
      // inert no-op (never a partial/destructive edit of an element with children).
      if (!el || !isTextLeaf(el)) return;
      e.preventDefault();
      e.stopPropagation();
      selectedId = id;
      send({ t: "readout", readout: readoutOf(el, id) });
      const originalText = el.textContent ?? "";
      el.setAttribute("contenteditable", "true");
      el.focus();
      let cancelled = false;
      const onKey = (ev: KeyboardEvent): void => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          el.blur();
        } else if (ev.key === "Escape") {
          cancelled = true; // revert; don't emit an edit
          el.blur();
        }
      };
      const finish = (): void => {
        el.removeAttribute("contenteditable");
        el.removeEventListener("keydown", onKey);
        if (cancelled) {
          el.textContent = originalText;
          return;
        }
        const text = (el.textContent ?? "").trim();
        // Record as an ephemeral override so an HMR re-render doesn't silently revert
        // the edit before it's persisted through the gated modify flow.
        const t = textOverrides.get(id);
        if (t) t.applied = text;
        else textOverrides.set(id, { applied: text, original: originalText });
        send({ t: "textEdited", nodeId: id, text });
      };
      el.addEventListener("blur", finish, { once: true });
      el.addEventListener("keydown", onKey);
    },
    { capture: true },
  );

  // Keep the selected node's overlay aligned during scroll / resize / layout shifts.
  // Coalesced behind a single rAF so a busy app can't flood the bridge with geometry
  // events — at most one emit per frame (Phase 2), mirroring the pointermove flush.
  let geomPending = false;
  const flushGeometry = (): void => {
    if (geomPending) return;
    geomPending = true;
    requestAnimationFrame(() => {
      geomPending = false;
      if (selectedId) emitGeometry(selectedId);
      emitAnchorRects(); // keep comment pins aligned with their sections too
    });
  };
  window.addEventListener("scroll", flushGeometry, { passive: true, capture: true });
  window.addEventListener("resize", flushGeometry, { passive: true });
  new MutationObserver((records) => {
    // Keep the selected overlay aligned for cheap attribute/layout mutations…
    flushGeometry();
    // …and when the DOM's structure changed (an HMR re-render or route swap),
    // rescan so ids re-acquire their elements and the selection re-locks.
    if (records.some((r) => r.type === "childList" && (r.addedNodes.length || r.removedNodes.length))) {
      scheduleRebuild();
    }
  }).observe(document.documentElement, { attributes: true, childList: true, subtree: true });

  // Report uncaught errors / rejections so the host's Run Doctor can diagnose them.
  window.addEventListener("error", (e: ErrorEvent) => {
    send({
      t: "runtimeError",
      message: e.message || String(e.error ?? "Error"),
      source: e.filename || undefined,
      line: typeof e.lineno === "number" ? e.lineno : undefined,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    send({
      t: "runtimeError",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  send({ t: "ready", ok: true });
  send({ t: "tree", tree: buildTree() });
}

// The guest DOM may not be ready when the preload runs.
try {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }
} catch (err) {
  send({ t: "ready", ok: false, message: err instanceof Error ? err.message : String(err) });
}
