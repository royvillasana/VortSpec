## Why

Every style edit on the canvas hits exactly one element, because selection is one element (`selectedId: string | null`). There is no way to say "all the buttons" or "these five cards" — so a change that is conceptually one decision becomes N identical manual edits, and the design system learns nothing from any of them.

Worse, the mechanism for the most common version of this request already exists and is unreachable. `theme-overrides.components` is a complete, durable, per-component override path — schema, materializer (`[data-component="Button"] { … }`), IPC handler, preload binding — and **no UI has ever called `setThemeComponentOverride`**. A project can end up with a component override applying to every page with no screen anywhere that shows it, let alone edits it. "Change every Button" is a solved problem in the engine with no way to ask for it.

The missing idea is **scope**. A style edit is a value plus a blast radius, and today the blast radius is hardcoded to 1.

## What Changes

- **Every style edit carries a scope.** The Design Attributes panel gains a scope selector on the edit itself — `This element` / `N selected` / `All N <Component>` / `--token · N uses` — each labelled with its real count, so the blast radius is visible before the write. The same control and the same value route to a different destination per scope.
- **The default scope is derived, not remembered.** A deterministic rule reads what the selection has in common and preselects the narrowest *meaningful* scope: a shared token binding → Token, else a shared `data-component` → Component, else Selection. No heuristic guessing at intent beyond what the selection literally shares.
- **Token promotion.** When an element-scoped edit would set N elements to a value their shared token already governs, the panel offers to change the token instead, naming its use count. Edits move up into the design system rather than scattering as per-instance overrides.
- **Multi-select.** `selectedId` becomes `selectedIds`: Shift/Cmd-click on the canvas and in the layer tree, marquee drag on the canvas, and `Escape` to clear. **BREAKING** for the bridge's selection payload and every consumer of `selection` (Design Attributes, assistant context, comments, delete, drag-move).
- **Intersection editing.** With N selected, Design Attributes shows shared values as editable and differing values as `Mixed`, writing only the properties actually touched — never flattening a property the user did not edit.
- **Select all matching.** From one element: select every sibling instance sharing its component, its tag, or its binding to a given token. This is how "every button on the screen" is expressed as a reviewable, highlighted selection rather than a blind global rule.
- **The component scope becomes reachable.** The existing `theme-overrides.components` path gets its first UI entry point, and existing component overrides become visible and clearable instead of silently applying forever.

Explicitly **not** included: a raw CSS-selector scope (`every div`). A structural tag is not a design concept — rounding every `div` hits layout wrappers, scroll containers, and spacers, and it is the one scope that cannot travel to generated code. `Select all matching` covers the real intent with a set the user can see and correct first. See design.md for the full rationale.

## Capabilities

### New Capabilities
- `scoped-style-edits`: the scope model — what scopes exist, how the default is derived from the selection, where each scope writes, how blast radius is shown before committing, and how token promotion is offered.
- `canvas-multi-select`: selecting many elements on the canvas and in the layer tree, select-all-matching, and editing a heterogeneous selection through shared/`Mixed` fields.

### Modified Capabilities
- `instant-canvas-edits`: an edit is now (value × scope) rather than (value × selected element); the routing rule and the deterministic-write requirement extend to a fan-out over N elements and to the two durable overlay scopes, while keeping the gate-less, optimistic, reversible guarantees.
- `component-token-customization`: the per-component override, already spec'd as an engine capability, gains a required UI entry point and a requirement that existing component overrides are visible and clearable.
- `canvas-selection-context`: the assistant's ambient selection context must describe a multi-selection honestly (count and what the members share) rather than a single element.

## Impact

- `packages/ui/src/lib/useInspectorBridge.ts` — `selectedId` → `selectedIds`, multi-target `override`, selection commands.
- Guest bridge / canvas overlay — multi-select hit-testing, additive click, marquee, N selection rectangles.
- `packages/ui/src/components/run-canvas/DesignPanel.tsx`, `NodeTree.tsx` — scope selector, `Mixed` fields, multi-select in the tree.
- `packages/ui/src/views/RunApp.tsx` — `commitEdits` fan-out; routing an edit to the overlay instead of page source when scope is Component or Token.
- `packages/core/src/shared/theme-overrides.ts`, `token-writers.ts` — no schema change expected; the component path is already complete.
- `packages/ui/src/views/LibraryPanel.tsx` — surfacing and clearing existing component overrides.
- Assistant selection context payload (`canvas-selection-context`).
- No IPC contract change expected: `setThemeComponentOverride` and `setThemeTokenOverride` already exist and are already validated.
