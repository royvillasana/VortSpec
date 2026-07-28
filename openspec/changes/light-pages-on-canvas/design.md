## Context

The framework RunCanvas (`packages/ui/src/components/run-canvas/RunCanvas.tsx`) embeds the
project's dev server in an Electron `<webview>`, injects the guest preload
(`inspector-bridge`) to instrument the live DOM, and draws the selection/hover overlay. The
left DesignPanel, layers tree, selection, drag, move, and insert are all driven by the
`InspectorBridge`. Edits are classified by `shared/canvas-edit-router.ts` and, on the
`deterministic` route, persisted to React source by `main/canvas/write.ts` (`applyCanvasEdit`)
+ `codemod.ts` (ts-morph on JSX), aided by a Vite dev-stamp that maps DOM nodes → source
locations.

Light pages are framework-free HTML at `.vortspec/light-pages/<name>.html` where the DOM IS
the source. Today they are edited by a SEPARATE component (`LightPageCanvas.tsx`) — a
same-origin iframe instrumented from the parent with its own controls — which the framework
DesignPanel can't see and which duplicates functionality. This change makes the framework
canvas the one editor for both, with light pages persisting as HTML.

Constraints: VortSpec-only (tracked packages, not the SDD-DE toolkit); VortSpec never calls
Figma directly; no new editing controls — reuse the existing canvas UI and handlers.

## Goals / Non-Goals

**Goals:**
- One Playground editor: the framework RunCanvas + DesignPanel + drag/move/select/layers/insert
  edits BOTH framework screens and light pages, with identical UX.
- A light page renders in that canvas (served HTML + guest preload) so the bridge instruments it.
- Canvas edits on a light page persist as HTML/CSS/JS (serialize the live DOM), routed by page kind.
- Remove the parallel `LightPageCanvas`, its right panel, and the on-canvas "Convert to code".
- Framework code generation becomes an explicit, batched Flow step that targets the user's
  SELECTED framework (from the initial flow), with audit + AI + visual validation.
- The user never sees "light"/"lightweight" in the UI — screens are just "pages"/"screens".

**Non-Goals:**
- No redesign of the DesignPanel or any control — reuse as-is.
- No change to the framework (React/ts-morph) persistence path for real screens.
- Not building the multi-framework compile here (React-first, as in light-design-system).
- Not changing the SDD-DE toolkit or calling Figma directly.

## Decisions

- **Reuse RunCanvas + InspectorBridge for light pages; do not extend LightPageCanvas.**
  The bridge already provides selection/tree/rects/drag/insert. Point it at a served light page.
  *Alt considered:* keep two editors — rejected: divergence + duplicated, inferior controls
  (the exact problem being fixed).

- **Serve light pages to the webview instead of loading a data/file URL.** The guest preload
  and the bridge assume an `http(s)` origin (same-origin DOM access, navigation, overlay
  coordinates). Serve `.vortspec/light-pages/` from a tiny local static origin (or the existing
  dev-server harness) and point the webview at `…/<name>.html`.
  *Alt considered:* `srcdoc`/`data:`/`file:` — rejected: breaks same-origin bridge assumptions
  and the webview URL model the overlay/navigation rely on.

- **Route edit persistence by PAGE KIND, at the canvas-edit dispatch.** For a framework page:
  the existing `applyCanvasEdit` (ts-morph). For a light page: serialize the guest DOM and write
  the `.html` (a new `applyLightCanvasEdit`/DOM-serialize path). The DOM is the source, so no
  stamp/AST mapping is needed and the move-nesting class of bug can't occur.
  *Alt considered:* an HTML AST codemod mirroring `codemod.ts` — rejected: unnecessary; the DOM
  already reflects the edit, so serialize-whole-DOM is simpler and lossless.

- **No source stamps for light pages.** The dev-stamp/Vite plugin maps DOM→React source; light
  pages don't need it (DOM==source). The bridge identifies nodes by its own fingerprint, which
  already works without VortSpec stamps.

- **Framework generation lives in the Flow, not the canvas.** A batched "Generate code" action
  converts the screens to code in the user's SELECTED framework (from the initial flow /
  `project.yaml` `framework` — React, Vue, Svelte, Angular; NOT hardcoded React), reusing
  `compile.ts` for the deterministic skeleton where it targets React and the framework-specific
  compose flow otherwise, then builds/reuses components, audits, and runs AI + visual validation.
  Triggered when the user is ready — never during editing.
  *Alt considered:* generate React always and transpile — rejected: the user picks the framework
  up front and expects native output in it.

- **User-facing terminology hides the implementation.** The UI calls these "pages"/"screens"
  everywhere; "light"/"lightweight"/HTML is never shown to the user. Internal code and paths
  (e.g. `.vortspec/light-pages/`, page-kind routing) may keep the "light" name.
  *Alt considered:* expose "light page" as a distinct concept — rejected: the user should not
  need to know the current screen is HTML under the hood; it's just how VortSpec works.

- **Interactivity via Astro-style Dynamic Islands (optional).** Where a screen needs client
  interactivity beyond static HTML/CSS, the lightweight page MAY use Astro Dynamic Islands (an
  island of hydrated behavior in an otherwise static page). This stays framework-free from the
  user's perspective and maps cleanly onto the existing island/`data-component` model; adopt it
  only where interactivity is actually needed, not for every screen.
  *Alt considered:* inline ad-hoc `<script>` per screen — acceptable for trivial cases, but Astro
  islands give a consistent, bounded hydration model when interactivity grows.

## Risks / Trade-offs

- **The bridge/overlay may assume a running dev server / stamped source.** → Verify the guest
  preload + bridge work against a plain served HTML origin; if any path hard-depends on the
  dev-stamp, gate it so light pages skip it (they don't need source mapping).
- **Serving a local origin adds a moving part (port/lifecycle).** → Reuse the existing managed
  dev-server/static-serve machinery; scope it to `.vortspec/light-pages/`; tear down with the view.
- **Insert/component ops on the framework path assume roster components + JSX.** → For light
  pages, insert composes framework-free HTML stand-ins (already built) and the DOM-serialize
  persist covers it; keep the framework insert path unchanged.
- **Cannot be GUI-verified by the agent (no Electron drive).** → Land in small steps, each with
  a concrete artifact/typecheck/test, and rely on the user to confirm each step in the app.
- **Losing the light-first "Convert" affordance mid-edit.** → Acceptable and intended: framework
  generation is deliberately a separate, batched Flow step, not an editing action.

## Migration Plan

1. Add the light-page served surface + webview load path (render only; no persistence yet).
2. Route canvas-edit persistence by page kind (light → DOM-serialize `.html`).
3. Switch RunApp's light page to the RunCanvas path; delete `LightPageCanvas` + its panel + Convert.
4. Add the Flow "Generate framework code" batched step (audit + AI + visual validation).
Rollback: the deleted `LightPageCanvas` and the on-canvas Convert can be restored from git; the
framework path is untouched throughout.

## Open Questions

- Which local-serve mechanism best fits (reuse the managed dev-server harness vs a dedicated
  static server for `.vortspec/light-pages/`)?
- Does any bridge/overlay code hard-depend on the Vite dev-stamp such that a light page needs a
  no-op stamp shim, or does fingerprint-only identity fully cover it?
- Should the Flow "Generate framework code" run per-page or whole-site in one pass?
