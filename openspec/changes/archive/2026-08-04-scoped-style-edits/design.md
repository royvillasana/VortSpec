## Context

Three write paths for style already exist. Two are deterministic and durable; one has no UI.

| Path | Data | Emits | Reach | Reachable? |
|---|---|---|---|---|
| Token | `theme-overrides.tokens` | `:root { --radius-card: 0 }` | everything referencing the token | ✅ Library panel |
| Component | `theme-overrides.components` | `[data-component="Button"] { … }` | every instance, every page | ❌ **no caller** |
| Element | page source / live DOM | inline | one element | ✅ Design Attributes |

`setThemeComponentOverride` is bound in `preload/index.ts` and handled in `ipc.ts`, and `materializeComponentCss` already emits its rules into every served page. Nothing in `packages/ui` ever calls it. The AstryxTest project currently carries `[data-component="Button"] { border-radius: 0 }`, applying to every page, surfaced nowhere.

Selection is `selectedId: string | null` in `useInspectorBridge`. Every consumer — `DesignPanel`, `NodeTree`, `commitEdits`, `deleteSelected`, drag-move, comments, assistant context — reads that single id.

Supporting facts that make the derived-default rule cheap: the Library panel already computes per-token **use counts** (`design-library.ts`, `uses`), `screen-tokens.ts` already maps which screens declare which tokens, and light pages already mark every design-system instance with `data-component`.

Constraint from the project's own principles: manual edits are **deterministic and instant** — no Apply/Keep gate, AI reserved for language prompts. Every scope must therefore be a computed write, never an agent run.

## Goals / Non-Goals

**Goals:**
- One control sets a value; a visible scope decides its blast radius.
- The default scope is derived from what the selection literally shares — no intent modelling.
- Reach is stated as a count before the write, not discovered after it.
- Edits can move *up* into the design system (token promotion) rather than scattering as per-instance overrides.
- Multi-select on canvas and in the layer tree, with honest `Mixed` handling.
- The already-built component override becomes reachable, visible, and clearable.

**Non-Goals:**
- A raw CSS-selector scope (`every div`). See Decisions.
- Changing the overlay schema. The component path is complete; this change adds callers, not columns.
- Cross-page bulk editing. Scopes reach across pages only where the *overlay* already does (component, token); `selection` is per-page by construction.
- Any AI involvement in applying a scope.
- Reworking how the overlay reaches the canvas — that is fixed separately by having the canvas watch the overlay file.

## Decisions

### Scope is a property of the edit, not a mode

**Chosen:** the scope selector lives on the edit control, next to the value, and resets to its derived default per property.

**Alternative — a global mode** ("now editing components"): rejected. A sticky mode is invisible at the moment it matters and produces exactly the failure this change exists to prevent — a change with a blast radius the user did not intend. Scope-per-edit costs one row of UI and makes the reach unmissable.

**Alternative — a separate "Apply to all" button** after an element edit: rejected. It makes the wide edit a second action that must be discovered, and leaves the first (narrow) write already committed and needing cleanup.

### The default scope is derived, and derivation is total

The rule is a pure function of `(selection, property)`:

1. all members resolve the property through the same token → `token`
2. else all members share a `data-component` → `component`
3. else `|selection| > 1` → `selection`
4. else `element`

Ordering token above component is the opinionated part: when the design system already governs a property, editing the instance fights it. This is the rule that turns the feature from a bulk-edit convenience into something that improves the design system.

It is deliberately **total and history-free** — no learning, no last-used memory, no frequency weighting. A default the user cannot predict is worse than a default they have to change, and a derivation that reads only what the selection exposes can be unit-tested exhaustively.

### No raw CSS-selector scope

`div` is a structural tag, not a design concept. A `border-radius` applied to every `div` hits layout wrappers, scroll containers, and spacers; the result is noise the user must then undo one element at a time. It is also the only scope that cannot travel to generated code — there is no honest place to write "every div" into a React component.

**Instead:** `select all matching` produces the same reach as a global rule while keeping the set visible and correctable. The user selects one card, asks for all 12, sees 12 highlighted, removes the two that were wrong, and edits. Same power, reviewable.

If a raw selector scope is ever added, it should be a *selection* operation (match → highlight → confirm), never a standing rule.

### Overlay-scoped edits go through the existing durable path untouched

`component` and `token` scope call `setThemeComponentOverride` / `setThemeTokenOverride` — the same functions the Library panel and presets already use. No new persistence, no new materializer, no new IPC. The consumed-source write guard, the `origin` tagging, and the `theme_apply` routing all keep working because this change adds no new way to write.

This is why the change is smaller than it looks: **the wide scopes are already implemented.** What is missing is a caller and a UI.

### Selection becomes a set with a focused member

`selectedId: string | null` → `selectedIds: string[]` plus a focused member. The focused member is what single-target operations that cannot fan out (rename, reparent, insert-into) act on, so those need no redesign. `bridge.override(id?)` already takes an optional target, so fan-out is a loop over the set rather than a protocol change.

**Alternative — a parallel "bulk selection" alongside the existing single selection:** rejected. Two selection states that can disagree is a bug generator, and every consumer would have to decide which one it means.

### `Mixed` writes only what was touched

The panel tracks which fields the user actually edited in this interaction and writes only those. A field showing `Mixed` that is never touched is never written. This is the difference between a bulk edit and a bulk overwrite, and it is the single most damaging thing to get wrong — flattening a property the user never looked at is silent, wide, and hard to notice.

### Phasing

Three phases, each independently shippable:

1. **Scope selector over the existing component override.** No multi-select. Delivers "change every Button" against machinery that already works, plus listing and clearing existing overrides. Smallest useful slice; also the one that makes an invisible existing override visible.
2. **Multi-select + intersection editing.** The larger build: bridge, guest hit-testing, overlay, layer tree, `Mixed`.
3. **Select-all-matching + token promotion.** Depends on both — matching needs multi-select to express its result, promotion needs the scope model to have somewhere to promote to.

## Risks / Trade-offs

- **A wide edit is easy to make and hard to notice** → every scope states its count before the write, the edit is one undo, and phase 1 ships the override *list* alongside the ability to create one, so a wide edit always has a visible home.
- **Silent flattening of `Mixed` properties** → only user-touched fields are written; asserted directly in the spec and in tests, not left to panel implementation.
- **Selection identity across a reload** → members that cannot be re-acquired are dropped, never substituted. The bridge already tracks element identity for override replay; reuse it rather than inventing a second scheme.
- **Token promotion becoming nagging** → offered only when every member shares the token for that property, and declining is one gesture that completes the original edit unchanged.
- **`selectedIds` is a breaking change across many consumers** → phase 2 is a single mechanical migration with a selection-of-one that behaves exactly as today, so the regression surface is "does one-element selection still work", which existing component tests already cover.
- **Marquee vs drag-move ambiguity** → the marquee only begins on empty canvas space; a drag starting on an element remains that element's move, which is the existing behaviour.
- **Per-component overrides are keyed by `data-component`, which only exists where instances are marked** → the `component` scope is simply not offered on unmarked elements, rather than falling back to something approximate.

## Migration Plan

No data migration. The overlay schema is unchanged, and overrides written before this change are read, listed, and cleared on the same terms as new ones — including ones with no `origin` tag.

Rollback is per phase: phase 1 removes a UI affordance and leaves the overlay untouched; phase 2 reverts the selection type; phase 3 removes two affordances. No phase changes what is on disk in a way an earlier version cannot read.

## Open Questions

- Should `selection` scope be offered at all when `component` is available and every member is an instance of it — or is the narrower scope always worth keeping visible? Current answer: keep both visible; the count makes the difference obvious.
- Should `select all matching` reach across pages for component matches, given the `component` scope already does? Current answer: no — matching selects elements, and elements on other pages cannot be highlighted or corrected.
- Does the token scope need a mode qualifier (light/dark) in the scope selector, or is it enough that the Library panel's editor already handles `light-dark()` pairs?
