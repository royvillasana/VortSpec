## Why

The Run Canvas can *change* what already exists — select an element, edit its tokens, switch its variant, refactor it into a component. It cannot **add** anything. There is no way to point at an empty space between two elements and say "put a filters row here," and no way to see more than one answer to that question: every action in the codebase today is exactly one agent run producing exactly one result written straight to disk. The only choice the user is ever offered is a binary Keep/Revert after the fact.

At the same time, the Playground's canvas controls are in the wrong place. The Inspect/Interact/Comment toggle is buried in the **Layers header of the left sidebar** (`DesignPanel.tsx:496`), the zoom controls sit in that region's footer and *vanish when Layers is collapsed*, and the same three-way toggle is re-implemented a second time in `CommentsPanel.tsx:51` because that panel replaces the Design panel in comment mode — two copies kept in sync by hand.

> **Naming, because it is genuinely confusing and an earlier draft of this proposal got it wrong.** The activity *key* `run` is labelled **"Playground"** in the UI (`ActivityBar.tsx:97-99`) and renders `RunApp kind="app"`, which already has the canvas, the three modes, and selection→chat. The activity *key* `play` is labelled **"Storybook"** and renders `RunApp kind="storybook"`, a plain iframe. `RunApp` itself renders its header as `{isApp ? "Playground" : "Storybook"}`. Throughout this change, **"Playground" means the `run` key** — the surface that already has the canvas. Storybook is explicitly out of scope.

And selecting an element still doesn't really *ground* the assistant. `buildSelectionContext()` produces good context (label, component, source file, variants, token-backed values) but it only fires from four canned actions, it must be triggered by a right-click, and it is cleared on submit (`setAttachments([])`). There is no ambient "this is what I'm looking at" that survives a conversation.

Impeccable ([impeccable.style](https://impeccable.style/), [ADR](https://github.com/pbakaus/impeccable/blob/main/docs/adr-live-variant-mode.md)) demonstrates the missing half on an architecture nearly identical to ours — a local server plus the user's own Claude Code CLI editing the user's own files — with an insertion-point picker, a resizable placeholder, and three generated variants you cycle before accepting one. Its Insert mode generates **net-new HTML/CSS** and ignores the component library. VortSpec's premise inverts that: we already have a built, verified, tokenized component roster, so our three options should be **compositions of the user's own components**. That is the differentiator, not the copy.

## What Changes

- **Slot picking on the canvas.** A new **Insert** mode hit-tests the *gaps between siblings* (not just elements), inferring the flow axis from the container's computed layout, and renders an insertion line. Clicking materializes a **resizable placeholder** that participates in real layout, whose size ships to the agent as a soft hint.
- **Three composed options, from the design system.** The user prompts the placeholder; VortSpec runs a gated Claude Code step that returns **three options, each composed from components in `.sdd-de/components.json`** with variants/props chosen, grounded in the project's tokens and DESIGN.md. Options are cycled and previewed in place; exactly one is accepted. When no library component fits an option, that option is surfaced as **"no component matches — extract a new one?"** routing into the existing extract-component flow rather than silently emitting hand-written markup.
- **A bottom canvas toolbar.** The mode toggle and zoom controls move out of the left sidebar into a single floating toolbar pinned bottom-center over the canvas, carrying **Inspect · Interact · Comment · Insert**, zoom, and a live/bridge status indicator. The duplicate toggle in `CommentsPanel` is deleted and the canvas renders the one component. **BREAKING (internal):** `DesignPanel`/`CommentsPanel` lose their `mode`/`onModeChange`/`zoom` props.
- **Selection becomes ambient context.** The current selection is exposed to the assistant as a **persistent, live-updating context chip** that survives turns and updates as the selection changes, replacing the one-shot right-click attachment. Explicitly detachable, and it never auto-sends a prompt.
- **A stale docstring is corrected.** `RunCanvas.tsx:17` documents a "Pan" mode that does not exist and never has (`CanvasMode` has no such member). Pan is **not** added by this change; the docstring is fixed to name the real modes.

## Capabilities

### New Capabilities
- `canvas-compose`: slot/gap hit-testing and the insertion placeholder; the N-option composition run that proposes compositions of the project's own components for that slot; option cycling, preview, accept/discard, and the no-library-match escape into extract-component.
- `canvas-toolbar`: the single floating bottom toolbar over the Playground's canvas — Inspect/Interact/Comment/Insert modes, zoom, and bridge/liveness status — replacing the sidebar-embedded and CommentsPanel-duplicated controls.
- `canvas-selection-context`: the persistent, live-updating selection context surfaced to the assistant — what it contains, when it updates, how it is detached, and the guarantee that it grounds but never auto-runs.

### Modified Capabilities
<!-- None. The three capabilities this builds on (`run-canvas`, `preview-inspector-bridge`,
     `visual-token-editing`) are not yet in `openspec/specs/` — they live in the unarchived
     `run-canvas-visual-editor` change — so there is no published requirement to modify; this
     change only ADDs. `inspector-playground` is unaffected at the requirement level: it
     specifies what the Playground renders and gates, not which input modes the canvas offers.
     `ide-preview-bar` is a different surface (a bar at the bottom of the *editor group* that
     opens a dev server in an external browser) and is NOT touched by this change — see design.md,
     which reconciles the naming collision. -->

## Impact

- **Depends on `run-canvas-visual-editor`** (implemented on `main`, tasks complete, **not yet archived**). Its `run-canvas` / `preview-inspector-bridge` / `visual-token-editing` capabilities should be synced or archived so this change builds on published specs rather than an in-flight change.
- **`apps/ide/src/preload/guest.ts`:** gap hit-testing, insertion-line rendering, the placeholder element and its resize handles, and placeholder-anchor re-acquisition across HMR. Extends the existing uid/fingerprint scheme (`uidOf`/`byId`/`fpToUid`).
- **`packages/core/src/shared/inspector-bridge.ts`:** new zod-typed commands/events for insert mode (`setMode` gains `insert`; hover→gap, placeholder create/resize/clear, option preview).
- **`packages/core`:** an option-composition prompt builder + a zod-validated result contract; the component roster (`getInspectorComponents`) becomes an input to composition, not just to the assign picker.
- **`packages/ui`:** new `CanvasToolbar` (bottom-center) and `InsertPanel`/option-cycler; `RunCanvas` gains the insert overlay; `DesignPanel`/`CommentsPanel` shed their toggles; `RunApp` owns insert state.
- **`apps/ide/src/renderer/src/App.tsx`:** replace the `PendingSelectionRef` fake-line-range hack with a real ambient-selection channel.
- **Out of scope:** the Storybook activity (key `play`) keeps its plain iframe. Giving it the canvas would mean lifting the `isApp` gate and validating the bridge against Storybook's per-story layout — a separate change, and not something this one needs.
- **Invariants upheld:** Claude Code composes and writes every option (invariant 1) — VortSpec never authors markup; options are written into source under a snapshot and require an explicit Accept, matching the precedent already set by the structural-edit path at `RunApp.tsx:535-587` (invariant 3); no new spawns and the webview still loads only the resolved localhost dev URL (invariant 7); the bridge stays preload-injected, so unlike Impeccable we never rewrite the user's entry HTML or patch their CSP (invariant 6).
- **Scope:** `apps/ide` only. `apps/desktop` lacks `webviewTag` (`apps/desktop/src/main/index.ts:26`), has no guest-preload build target, and routes its preview to the legacy `DevPreview.tsx`; porting it is a separate change.
- **Risks:** (1) three options in one source file conflict — Impeccable serializes to one generation at a time for exactly this reason; (2) HMR eats the placeholder — anchor re-acquisition is where the real cost is; (3) latency — Impeccable lands ~15–20s per generation *after* heavy optimization, so progress UI and cancellation are requirements, not polish; (4) element→source mapping stays heuristic (class-signature/text), so composition must degrade to asking rather than guessing.
