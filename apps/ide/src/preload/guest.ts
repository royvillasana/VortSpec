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
} from "@vortspec/core/inspector-bridge";

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
/** Input mode: `interact` (default) lets the app work; `inspect` intercepts hover/click to select. */
let mode: "inspect" | "interact" = "interact";

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
      if (mode !== "inspect" || rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const id = idUnder(e.target);
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
      if (mode !== "inspect") return;
      const id = idUnder(e.target);
      if (id === null) return;
      e.preventDefault();
      e.stopPropagation();
      selectedId = id;
      const el = resolve(id);
      if (el) send({ t: "readout", readout: readoutOf(el, id) });
    },
    { capture: true },
  );
  // Swallow the follow-up click so an inspected control doesn't also activate.
  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      if (mode !== "inspect") return;
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
