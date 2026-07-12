## Context

The Run section (`packages/ui/src/views/RunApp.tsx`, IDE activity `"run"`) embeds the user's running dev server in a plain cross-origin `<iframe src="http://localhost:<port>/">`. The frame is opaque: VortSpec cannot read the guest DOM, cannot draw aligned overlays on it, and offers no direct-manipulation editing. Meanwhile a rich token/component substrate already exists and is reused here rather than rebuilt:

- **`packages/core/src/main/inspector/token-parser.ts`** — parses `--name: value;` from the project token file, `classify()`/`resolve()` follow `var()` chains, `buildUsage()` scans component sources, `setInspectorTokenValue()` rewrites one declaration in place, `snapshotTokenScope()` captures a revertable scope.
- **`packages/core/src/main/inspector/component-reader.ts`** — component roster + `PropControl`s from CVA; carries a `previewUrl` field currently stubbed `null`.
- **`packages/core/src/main/workspace/dev-server.ts`** — resolves & starts the dev server, scrapes the URL from stdout, pushes `devserver:update`.
- **`packages/ui/src/views/Inspector.tsx`** — token table + color/value editors + gated Claude runs (`useAgentRun`) with `snapshot*` / `restoreFiles` revert.
- **`apps/ide/src/renderer/src/components/Explorer.tsx`** — the flat-map (`Record<parent, node[]>`) + `Set<string>` expand pattern the node tree will mirror.

Constraints from CLAUDE.md: Claude Code is the engine (never re-implement source edits), spec-first gates (no file mutation without approval), local-first (writes land in the project's own files), safe process handling (no shell interpolation; child processes only in the project folder). The IDE window today sets `sandbox:false, contextIsolation:true, nodeIntegration:false` and does **not** enable `webviewTag`.

## Goals / Non-Goals

**Goals:**
- Turn the Run section into a Figma-style canvas over the *real running app*: select a rendered element, see its box-model + the tokens behind it, and edit by dragging handles or fields.
- Live, instant visual feedback with **zero** file writes until an explicit apply.
- Commit token-value edits through the existing `inspector:setTokenValue` path; commit source/structural edits through gated Claude Code runs with revert.
- A component/DOM node-tree sidebar that cross-selects with the canvas.
- Work on *any* localhost dev server with no change to the user's project.

**Non-Goals:**
- Not a general web scraper / editor for arbitrary external sites — only the project's own resolved dev URL.
- Not a replacement for the Inspector Tokens page; it is a second, spatial entry point into the same write paths.
- No new spatial layout format, no re-parenting/adding DOM nodes in v1 (v1 edits values/box-model of existing elements, not tree structure).
- No re-implementation of Claude Code editing logic; structural edits are delegated.
- Windows/Linux webview parity is deferred (macOS first, per the pty portability posture).

## Decisions

### D1 — Electron `<webview>` + guest preload, not an instrumented `<iframe>`
An `<iframe>` to a cross-origin localhost port cannot expose its DOM to the host (same-origin policy), so overlays and inspection are impossible. An Electron `<webview>` can run a **guest preload** in the guest page's isolated world with full DOM access, regardless of origin, **without any cooperation from the user's app**. We enable `webviewTag: true` on the IDE window and ship a dedicated guest-preload bundle (a new electron-vite build input).
- *Alternatives considered:* (a) `BrowserView` — no in-layout embedding within the canvas transform, harder to pan/zoom; (b) postMessage bridge requiring the user to add a snippet/dev-dependency — violates the "no cooperation" goal; (c) Chrome DevTools Protocol against the dev server — heavier, brittle across frameworks. Webview+preload is the least invasive.

### D2 — Two-layer edit model: ephemeral override → gated commit
Direct manipulation writes an **in-memory CSS override** in the guest (instant feedback, nothing on disk). Commit is a separate, explicit step (spec-first gate). This cleanly separates "previewing" from "mutating files" and makes cancel/discard trivial (drop overrides).
- *Alternatives considered:* write-through on every drag — violates the gate and thrashes the file/reload; optimistic write with undo — riskier and muddier than ephemeral-until-apply.

### D3 — Commit routing by edit kind
- **Token-backed value** → `inspector:setTokenValue` (existing deterministic single-declaration rewrite). This is already an accepted non-Claude write in `Inspector.tsx`; the visual canvas is just another caller. Changing a token updates *every* element bound to it (surfaced as a "shared" warning).
- **Non-token literal / structural / bind-a-new-token** → **gated Claude Code run** via `useAgentRun`, with `snapshotComponent`/`snapshotTokenScope` first for revert. VortSpec never re-writes component source itself.
- *Rationale:* respects "Claude Code is the engine" for source, while keeping the fast, deterministic path for pure token values that the Inspector already owns.

### D4 — Bridge message protocol in `packages/core`, isolated
A small zod-typed protocol (host ⇄ guest) lives in `packages/core/src/shared/inspector-bridge.ts`: `requestTree`, `treeUpdate`, `selectNode`, `nodeDetails` (rect + computed box-model + style), `geometryUpdate`, `applyOverride`, `clearOverride`. The guest preload implements the guest side; a renderer hook (`useInspectorBridge`) wraps `webview.send`/`ipc-message`. Keeping the protocol in one module contains the Electron-specific surface (portability posture).

### D5 — Element→token resolution by inverting `token-parser`
On selection, the guest returns the element's `getComputedStyle` values and the `--custom-properties` in scope; the host matches resolved values/`var()` references against the parsed project tokens (reuse `resolve()` + `buildUsage()` inverted) to name the owning tokens. Element→component uses `data-component`/class/filename heuristics reusing `component-reader`, and fills the previously-stubbed `previewUrl` linkage.

### D6 — Node tree mirrors the Explorer pattern
Reuse the flat-map (`Record<nodeId, ChildNode[]>`) + `Set<string>` expanded + recursive depth-padded render from `Explorer.tsx`, fed by `treeUpdate` from the bridge instead of `api.listDir`. The Run activity swaps the sidebar content to this tree and restores the file Explorer on leaving.

### D7 — Canvas transform owns pan/zoom; overlay in canvas coordinates
A single CSS transform on the canvas wrapper scales/translates both the webview and an absolutely-positioned SVG/HTML overlay. Guest geometry (viewport-relative rects) is converted to canvas coordinates by the host so handles stay glued during pan/zoom/scroll.

### D8 — Design panel = Figma section taxonomy mapped to CSS, docked left
The left sidebar (where Explorer lives) becomes a Figma-style **Design panel**: a collapsible **Layers** node tree on top, then the selection's property sections in Figma's exact order — Current variant, Position, Layout (auto/outer layout), Appearance, Stroke, Fill, Effects, Colors, Layout guide. Each section is a thin adapter from the guest's computed style to a Figma-shaped control group:
- Position → offset/`transform` (rotation) + alignment/constraints affordances; Layout → flexbox (`flex-direction`, `flex`/`fit-content` for hug/fill, `justify`/`align`, `gap`, `padding`); Appearance → `opacity`/`border-radius`/`mix-blend-mode`/visibility; Stroke → `border-*`; Fill → `background`; Effects → `box-shadow`/`filter`; Colors → the color tokens in effect; Layout guide → CSS grid/guides when present.
- Token-backed values name their token (D5); literals show raw. Sections with no applicable values hide.
- *Rationale:* designers already know this taxonomy from Figma; mapping to CSS keeps it operating on the real code, not a metaphor. *Alternative considered:* a flat box-model list (original plan) — rejected as less legible and not matching the user's Figma mental model.

### D9 — Variant switching is a component-source edit, gated to Claude
The **Current variant** section reuses `component-reader`'s `PropControl`s (CVA `variants`/`defaultVariants`) to render a dropdown per variant prop. Switching previews live (toggle the variant's classes in the guest override) but **commit is a component-source change** (it edits the rendered instance's props), so it routes to a gated Claude Code run with snapshot/revert — never a direct VortSpec rewrite (Claude-Code-is-the-engine invariant). Only components with a resolvable source + variants show this section.

## Risks / Trade-offs

- **[Electron `<webview>` is semi-deprecated / heavy]** → Isolate all webview + bridge code behind `useInspectorBridge` and the `inspector-bridge` protocol module so a future swap (e.g. `BrowserView`/CDP) is contained; gate the whole feature behind the dev server running.
- **[Guest bridge can't attach on some apps / strict CSP]** → Feature degrades: the app still renders and stays interactive; a non-blocking notice says visual editing is unavailable (spec'd). No hard failure.
- **[Resize/drag maps ambiguously to a token]** → Only offer direct token write when a single owning token is resolved; otherwise route to a gated Claude run and show the shared/structural warning so the user chooses knowingly.
- **[Live override diverges from committed source]** → Overrides are always ephemeral and cleared on reload/cancel; after apply, the preview reloads from real files so what you see equals what's on disk.
- **[Security: instrumenting a page]** → The webview loads only the dev-server URL already resolved by `dev-server.ts`; no arbitrary navigation, no new process spawns, no shell interpolation. Bridge messages are zod-validated at the boundary.
- **[Scope creep toward a full visual builder]** → v1 explicitly excludes DOM re-parenting/adding nodes; it edits values of existing elements only.

## Migration Plan

1. Land behind the existing Run activity for the `app` kind only; Storybook kind keeps the current iframe initially.
2. Enable `webviewTag` and add the guest-preload build input; ship the bridge protocol + `useInspectorBridge` with the webview swap but overlay/editing dark until wired.
3. Layer on selection/overlay/handles, then the node tree, then the Element Inspector read-only, then editing (ephemeral), then commit routing.
4. **Rollback:** a single feature flag falls the Run view back to the plain `<iframe>` (`RunApp.tsx` retains that path); disabling the flag removes all webview/bridge surface from the render path.

## Open Questions

- Should Storybook kind also gain the canvas, or stay iframe-only for v1? (Lean: app-kind only first.)
- For structural edits, do we batch multiple pending visual edits into one gated Claude run, or one run per apply? (Lean: batch per apply.)
- Node identity across re-renders (frameworks re-mount) — is a computed path/heuristic handle sufficient, or do we need an injected `data-vs-node` id? (Lean: heuristic path first; revisit if flaky.)
