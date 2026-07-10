# Implementation Prompt — Harden the Run-Canvas Visual Editor

You are implementing changes in **VortSpec**, an Electron cockpit over the user's local Claude Code. This prompt asks you to make the existing **Run-Canvas visual editor** (the Figma-style live DOM inspector/editor) production-solid. The feature already works end to end; your job is to fix its structural weaknesses and optimize it — **not** to rebuild it.

Read `CLAUDE.md` and the OpenSpec change `openspec/changes/run-canvas-visual-editor/` before starting. The single source of truth for the bridge protocol is `packages/core/src/shared/inspector-bridge.ts`.

## The goal (do not lose sight of this)

The Run Canvas must let a user **select, inspect, and manipulate any component on a live, already-rendered page like Figma does — regardless of the framework that produced the DOM (React, Vue, Svelte, plain HTML).** Every change below must keep that framework-agnostic, no-cooperation-required property intact. If a change would require the previewed app to opt in (e.g. build-time instrumentation like Onlook's `data-oid`), it is out of scope — solve it from the guest side reading the rendered DOM.

## Non-negotiable invariants (violating any is a bug)

1. **Framework-agnostic, read-the-rendered-DOM.** The guest (`apps/ide/src/preload/guest.ts`) never assumes cooperation from the previewed app. No build-time instrumentation of the user's project.
2. **Ephemeral edits only.** Canvas edits apply as inline-style / class overrides in the guest and are **never** written to the user's disk. Persistence to source happens exclusively through the spec-first gated modify flow (send-to-chat → Claude Code run). Do not add any code that writes to project files from the guest or the canvas.
3. **Zod only at the boundary.** All host⇄guest messages stay defined and validated in `inspector-bridge.ts`. Do not scatter validation elsewhere. If you change the wire shape, change the schema there and update both sides.
4. **TypeScript strict, no `any`** outside test fixtures. Keep the Electron-specific surface isolated behind the bridge/adapter as it is today.
5. **Human-sentence errors.** Any new failure surfaces as a fix-it message with a next step, never a raw exception.
6. **Definition of done per phase:** the phase's "Done when" is verified end to end **through the UI**, new code has tests, and `pnpm build && pnpm test && pnpm lint` are green.

## Ground rules for how you work

- Work **phase by phase, in order.** Do not start a phase until the previous one's "Done when" passes. Commit at each phase boundary with a message scoped to that phase.
- Prefer the smallest change that satisfies the goal. Reuse existing patterns (the flat tree map, the single bridge channel, the rAF-throttled drag flush already in `RunCanvas.tsx`).
- Add or extend tests alongside each change: Vitest for guest/host units and parsers, Playwright for the canvas flow, and **recorded bridge-transcript fixtures** for deterministic run-view tests.
- After the final phase, run a verification pass (ideally via a separate review agent): re-read the diff against these invariants and the goal statement above.

---

## Phase 1 — Stable node identity (primary)

**Problem.** Node ids are array indices assigned per tree scan (`String(registry.length)` in `buildTree`, `apps/ide/src/preload/guest.ts`). Every HMR re-render rebuilds the registry, so an id can point at a different element afterward. The schema already documents `id` as *"a DOM path the guest can resolve back to the element"* (`inspector-bridge.ts`), but the implementation doesn't honor that. Selection, overrides, and the overlay can silently reattach to the wrong node after the previewed app re-renders.

**Goal.** A node id must be **stable across re-renders**: after an HMR update or any DOM mutation, a previously selected node id still resolves to the same logical element, the selection overlay stays on it, and any ephemeral override is re-applied to it.

**Tasks.**

- Design a stable identifier in the guest that does **not** depend on registry insertion order. Combine two mechanisms:
  - A **runtime handle**: a per-Element unique token stored on the element (e.g. a `WeakMap<Element, string>` uid, minted once and reused), so repeat scans of the *same* element yield the same id.
  - A **serializable fingerprint** for re-acquisition when the element object itself was replaced by a re-render: a structural DOM path (tag + `nth-of-type` chain from a stable ancestor, plus `id`/`data-component`/role and a class signature when present). Keep it compact and deterministic.
- On each tree rebuild, **re-map the previously selected id** (and any id with an active override) to the new element via fingerprint. If found, preserve the same id; if not, mark it lost and notify the host cleanly.
- Resolve `selectNode`, `applyOverride`, `hoverNode`, `setText`, `setClass`, and geometry emission through the new id→element resolver instead of `registry[Number(id)]`. Remove the numeric-index assumption everywhere in `guest.ts`.
- Keep ids as opaque `string`s so `inspector-bridge.ts` needs no type change. Update the id JSDoc to describe the real scheme.
- Host side (`useInspectorBridge.ts`, `RunCanvas.tsx`): when the guest reports that a selected node was lost after a re-render, clear selection/overlay gracefully (fix-it affordance, not a crash). When it's re-acquired, keep the overlay locked on it.

**Files.** `apps/ide/src/preload/guest.ts` (registry/`buildTree`/`idFor`/all command handlers), `packages/core/src/shared/inspector-bridge.ts` (JSDoc + any new event for "selection lost/reacquired"), `packages/ui/src/lib/useInspectorBridge.ts`, `packages/ui/src/components/run-canvas/RunCanvas.tsx`.

**Done when.** With a project running under HMR, select a nested element, trigger a source re-render of that subtree, and confirm the selection overlay and any live override stay on the correct element. Add a Vitest unit for the fingerprint resolver (given a serialized DOM, an id resolves back to the same node after a simulated re-render) and a Playwright step that selects → forces re-render → asserts the overlay is still on the same element.

> **Status (done).** Node ids are now opaque per-element uids (`WeakMap<Element,string>`), minted once and re-acquired across re-renders by a serializable structural fingerprint (`packages/core/src/shared/dom-fingerprint.ts`, unit-tested). `buildTree` re-maps uids by fingerprint; every command handler resolves through `resolve(id)`; a debounced `MutationObserver` rescans on structural mutations and re-locks the selection (or emits a new `selectionLost` event the host handles by clearing selection with a dismissible notice). **Override re-application to the re-acquired element is Phase 2** (overrides are still keyed by the element object). The live-HMR overlay check + Playwright step need a running dev server (hands-on pass); the fingerprint resolver is covered by `dom-fingerprint.test.ts`.

---

## Phase 2 — Override & geometry resilience

**Problem.** Ephemeral overrides live in a `Map<Element, string>` keyed by the element object. After a re-render replaces the element, the override is orphaned and the visual edit disappears. Geometry realignment leans on a `MutationObserver` over the whole `documentElement` subtree (`attributes + childList + subtree`) that calls `emitGeometry` on **every** mutation — heavy IPC on an active app — while the drag path is already nicely rAF-throttled.

**Goal.** Overrides survive re-renders (re-applied to the re-acquired element from Phase 1), and geometry updates are coalesced so a busy app doesn't flood the bridge.

**Tasks.**

- Re-key overrides and class overrides to the **stable id** (or re-apply them to the re-acquired element after each tree rebuild). After an HMR re-render, active overrides must reappear on their nodes without user action.
- Coalesce `emitGeometry` from the `MutationObserver` behind a single `requestAnimationFrame` (mirror the existing pointermove/flush pattern) so at most one geometry emit per frame regardless of mutation volume.
- Debounce full-tree rebroadcasts during mutation storms (e.g. HMR replacing a large subtree): rebuild/emit the tree at most once per short idle window rather than per mutation.
- Preserve the existing optimistic-drag behavior in `RunCanvas.tsx` (the `dragRect` / `settlingRef` handoff) — do not regress the no-lag resize.

**Files.** `apps/ide/src/preload/guest.ts` (overrides map, MutationObserver, tree emit), `packages/ui/src/components/run-canvas/RunCanvas.tsx` (only if the settle handoff needs to account for re-applied overrides).

**Done when.** On a page that mutates frequently, the overlay stays aligned with no visible lag and bridge message volume is bounded (verify via the guest console/IPC counts). An applied override remains visible across an HMR reload. Add a unit test for the rAF coalescing and a fixture-driven test that an override re-applies after a simulated tree rebuild.

> **Status (done).** Ephemeral edits are now keyed by the stable uid via a pure, unit-tested bookkeeping module (`packages/core/src/shared/override-store.ts`): `mergeStyle` captures each prop's true original once and keeps `applied` for re-painting; `mergeClass` keeps add/remove exclusive; `restorePlan` drives exact restore. `rebuildAndReacquire` calls `reapplyOverrides()` after each rescan so overrides survive an HMR re-render. The `MutationObserver`'s geometry emit is now coalesced behind a single `requestAnimationFrame` (`flushGeometry`) — at most one emit per frame — and full-tree rebroadcasts are debounced (150 ms, from Phase 1). `RunCanvas`'s optimistic-drag handoff is unchanged. The "override re-applies after a simulated rebuild" invariant is covered by `override-store.test.ts`; the live no-lag / bounded-IPC check needs a running dev server (hands-on pass).

---

## Phase 3 — Component resolution accuracy

**Problem.** `parseProps` in `packages/core/src/main/inspector/component-reader.ts` extracts CVA variants with regex and brace-balancing, but only matches **flat** variant groups (`([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*)\}`). It misses nested objects, `compoundVariants`, and non-CVA components, and it fails silently. Separately, `resolveComponent` in `packages/ui/src/components/run-canvas/compose.ts` admits it can't infer an instance's **current** variant from the DOM and defaults to `defaultVariants`, so the Current-variant panel can show the wrong state — even though `resembleComponent` already matches components by class signature.

**Goal.** More reliable variant parsing, and a correct "current variant" in the Design panel inferred from the element's actual classes.

**Tasks.**

- Make variant parsing robust: handle nested braces within a variant group, parse `compoundVariants`, and keep `defaultVariants`. Prefer a proper brace-aware tokenizer or the TypeScript compiler API over ad-hoc regex; if you keep regex, cover the missed cases with explicit tests. Parsing must degrade gracefully (return best-effort, never throw) and log nothing to the user.
- Infer the **current variant value** of a selected instance by reusing the `resembleComponent` class-signature approach: match the element's live `className` against each variant option's class set and set `VariantControl.current` accordingly, falling back to `defaultVariants` only when no class match exists.
- Keep this host-side and read-only; no new guest responsibilities.

**Files.** `packages/core/src/main/inspector/component-reader.ts` (`parseProps` and helpers), `packages/ui/src/components/run-canvas/compose.ts` (`resolveComponent`, reuse of `resembleComponent`), plus their existing `.test.ts` siblings.

**Done when.** Given fixture components using flat variants, nested variant values, and `compoundVariants`, `parseProps` returns the correct controls. Selecting an instance rendered with a non-default variant shows that variant as current in the panel. All new cases covered by Vitest.

> **Status (done).** `parseProps` is now a brace-aware tokenizer (`stripComments` → `splitTopLevel` → `splitKeyValue` → `extractClasses`) instead of a flat regex: it parses option values that are `cn()`/`clsx()` calls, arrays, or multi-line templates, strips comments first, keeps `defaultVariants`, isolates a sibling `compoundVariants` array from the base controls, and degrades to `[]` (never throws) on malformed source. Current-variant inference was already implemented via `detectVariant` in `selection-builder` (host-side, read-only) and is covered by `selection-builder.test.ts`; the stale `resolveComponent` comment is corrected. New cases in `component-reader.test.ts` (13 total: flat, cn/array/template values, compoundVariants present, malformed robustness).

---

## Phase 4 — Inline text-edit fidelity

**Problem.** Double-click text editing sets `el.textContent` (`guest.ts`, `setText` and the `dblclick` handler). This drops any inline-formatted children and can desync from a framework's virtual DOM, which may warn or overwrite. It's ephemeral, which is fine, but the behavior should be predictable and clearly scoped to true text leaves.

**Goal.** Inline text editing is limited to genuine text-leaf elements, is visibly ephemeral, commits cleanly, and does not fight the framework's reconciliation.

**Tasks.**

- Guard text editing strictly to text-leaf elements (no element children) — tighten the existing check and make the non-eligible case a no-op with a subtle affordance rather than a partial edit.
- Ensure the committed `textEdited` event carries the id and final text so the host can route it into the gated modify flow; the guest change stays ephemeral.
- Handle the case where the framework re-renders and reverts the ephemeral text: re-apply on re-acquisition (via Phase 1/2) or clearly show the edit as pending until persisted.

**Files.** `apps/ide/src/preload/guest.ts` (dblclick handler, `setText`), `packages/ui/src/lib/useInspectorBridge.ts` / consumer if the pending-state UI needs a hook.

**Done when.** Editing a text leaf updates it live and emits a clean `textEdited`; attempting to edit a non-leaf does nothing destructive; an HMR re-render does not leave a half-applied edit. Covered by a Playwright step and a guest unit where feasible.

> **Status (done).** A shared `isTextLeaf(el)` now guards both `setText` and the double-click handler (and backs `textLeaf`); double-clicking a non-leaf is an inert no-op, never a partial edit. Ephemeral text edits are tracked by stable uid in `textOverrides` (applied + original), re-applied in `reapplyOverrides` after each re-scan so an HMR re-render doesn't silently revert a pending edit, and cleanly reverted on `clearOverride`. Escape now cancels an inline edit (restores the original, emits no `textEdited`); Enter/blur commits and records the override. The guest is DOM+electron-coupled so the check is verified by build + the Playwright/hands-on pass (per "where feasible").

---

## Phase 5 — Token-aware value editing (raw value or design token)

**Problem.** Only the **color** field offers token binding (`ColorTokenField` in `packages/ui/src/components/run-canvas/DesignPanel.tsx`); every other token-backed field (margin, padding, gap, corner radius, and other lengths) merely shows a read-only `TokenBadge` and edits as a raw value through `TextField`. So a user cannot bind a spacing or radius token the way Figma lets you bind a variable to any numeric property. The project already ships parsed design tokens — `getInspectorTokens` in `packages/core/src/main/inspector/token-parser.ts` reads them from the configured token file and `classify` already types them as `spacing` / `radius` / `color` / `typography` / etc. **Do not create or modify tokens; only consume the existing ones.**

**Goal.** Match Figma's behavior: for every editable attribute (at minimum **body margin, color, border radius, and spacing/padding/gap**), the user can either type a **raw value** (e.g. `16px`) **or** bind one of the project's **predefined tokens**. When choosing a token, the picker lists each candidate **token name with its resolved value shown right next to it** (a swatch for colors, the value string for lengths). Binding a token applies it as an ephemeral `var(--token)` override so the live preview reflects the real token value; the field then shows the bound token name instead of the literal.

**Tasks.**

- Build a single reusable **token-or-raw control** for length-type fields (spacing, padding, margin, gap, radius, size) analogous to the existing `ColorTokenField`: a value input plus a token-picker popover. Reuse `ColorTokenField` for color fields; do not fork its behavior, unify the pattern.
- The token picker lists **only tokens whose type matches the field**: spacing tokens for margin/padding/gap, radius tokens for corner radius, color tokens for fill/text/border. Use the existing `classify`/`TokenType` output to filter — no new classification logic.
- **Each token row shows the token name and its value side by side** (e.g. `space-4  16px`, or a color swatch + `#2563EB`). Resolve `var()` chains to a concrete value for display (the parser's `resolve` already does this — reuse it).
- Binding a token emits `var(--<name>)` as the ephemeral override CSS (so the guest preview uses the real value), and sets the field's `token` so the panel shows the token name; choosing "raw" clears the binding and applies the literal. Nothing is written to disk (invariant 2).
- Wire the project's parsed tokens into the Design panel the same way `colorTokens` is already threaded through (host reads `getInspectorTokens`, passes the token list down to the panel/fields). Extend the plumbing so length fields receive their candidate tokens.
- If the `SectionField` shape needs to carry candidate tokens or a resolved token value, extend it in `packages/core/src/shared/inspector-bridge.ts` (keep it zod, keep it at the boundary). Prefer passing the token list as a panel-level prop over embedding it per field if that stays simpler.
- Ground component variation in tokens: where a variant/attribute value corresponds to a known token, surface and prefer the token binding rather than the raw value, so updates carry token semantics, not just pixels.

**Files.** `packages/ui/src/components/run-canvas/DesignPanel.tsx` (new unified `TokenOrRawField`, extend `Field`/`FieldControl`, token-value rows), `packages/ui/src/components/run-canvas/compose.ts` (`cssForField` → emit `var(--token)` when a token is chosen), `packages/core/src/main/inspector/token-parser.ts` (reuse `getInspectorTokens`/`resolve`; no behavior change expected), the panel host wiring in `packages/ui/src/views/Inspector.tsx`, and `packages/core/src/shared/inspector-bridge.ts` only if the field shape must change.

**Done when.** Selecting **margin** lets the user type `16px` **or** pick a spacing token, and the token list shows each token's name with its value beside it. Binding a **radius** token updates corner radius live; binding a **color** token still works via the unified path. The bound field displays the token name; switching to raw restores literal editing. Add Vitest coverage for token filtering by field type and for `cssForField` emitting `var(--token)` on a bound value, and a Playwright step exercising raw-vs-token on a length field.

---

## Phase 6 — Edit provenance for spec-first persistence

**Problem.** The path back to source is agent-mediated (send-to-chat → gated Claude Code modify run). Today a variant swap (deterministic: a known CVA option → a known class) and a freeform geometry drag (non-deterministic: an arbitrary `width` on a raw div) are carried to the assistant with equal, lossy context via `buildSelectionContext` (`compose.ts`). The agent has to guess intent for edits that actually have a precise, known mapping.

**Goal.** Tag each canvas edit with its **provenance** so the gated modify prompt is precise where it can be (variant/token changes) and clearly flagged as approximate where it can't (freeform geometry). This strengthens the spec-first gate without persisting anything from the canvas.

**Tasks.**

- Introduce a small, typed notion of edit provenance (e.g. `variant` | `token` | `freeform-style` | `text`) attached to each recorded edit. Keep the type in the shared boundary module if it crosses host⇄guest, otherwise host-side.
- Extend `buildSelectionContext` (and whatever seeds the assistant chat) so deterministic edits emit exact instructions ("set Button `size` variant to `lg`", "change token `--vs-space-3`") and freeform edits are labeled as approximate visual targets for the agent to realize in source.
- Do **not** add any disk-writing path here. Persistence remains the existing gated run; you are only enriching the context handed to it.

**Files.** `packages/ui/src/components/run-canvas/compose.ts` (`buildSelectionContext` + provenance), `packages/core/src/shared/inspector-bridge.ts` (only if the provenance type crosses the wire), the Design-panel edit call sites in `packages/ui/src/components/run-canvas/DesignPanel.tsx`.

**Done when.** A variant change and a freeform resize produce visibly different, correctly-scoped context strings for the assistant. Unit-test `buildSelectionContext` for each provenance kind. Confirm no new file writes exist anywhere in the canvas/guest path.

---

## Phase 7 — Verification pass

**Goal.** Prove the feature still fulfills its original purpose and nothing regressed.

**Tasks.**

- `pnpm build && pnpm test && pnpm lint` green across the workspace.
- Playwright end-to-end: start a project, enter Inspect mode, select a component, resize it, swap a variant, edit text, force a re-render, and confirm selection + overrides survive — all through the UI.
- Re-run the guest against at least two frameworks (a React/Tailwind project and one non-React or plain-HTML page) to confirm framework-agnostic behavior still holds.
- Token editing: on a length field, bind a project token and confirm the picker lists token names with their values, the live preview uses the token value, and a raw value still works — all through the UI.
- Have a separate review agent read the full diff against the invariants and the goal statement at the top of this prompt, specifically checking that (a) nothing writes to the user's project from the canvas/guest, (b) all wire changes stayed in `inspector-bridge.ts` with zod, and (c) no `any` leaked outside fixtures.

**Done when.** All of the above pass and the review agent finds no invariant violation.

---

## Out of scope

- Build-time instrumentation of the user's project (Onlook-style `data-oid`).
- Writing edits directly to source from the canvas — persistence stays in the gated Claude Code flow.
- Re-implementing agent logic, the SDD-DE methodology, or a normalization/IR pipeline. VortSpec is the cockpit; Claude Code is the engine.
