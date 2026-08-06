## Why

Editing one element changes many, and nobody asked for that.

Select a single Button, change a value, and the edit lands on every Button that currently looks the same. If the value came from a design token it goes further still — a token redefinition scoped to the component, reaching every page in the project. The user's report was exactly this: *"I'm applying the change only on that component, just like the button asked me to do"*, and the change hit every instance.

The behaviour is not a bug. `deriveScope` preselects the widest scope the selection can support, in this order: `component-token` → `token` → `matching` → `selection` → `element`. A single component instance almost always supports `matching`, so `element` is nearly unreachable as a default — it wins only when the element has no component identity to key on.

The reasoning behind it is sound and worth preserving: sweeping only look-alikes deliberately spares an element that was styled differently on purpose. What is wrong is which one happens *by default*. `style-scope.ts` states the principle itself — "a default the user cannot predict is worse than one they have to change" — and then defaults to the widest available scope, which is the least predictable one. A wide edit should be a decision, not the consequence of not noticing a control.

The cost is asymmetric, which is what settles it. A narrow edit that should have been wide is one more action. A wide edit that should have been narrow silently rewrites work across a page — or, through a token, across every page — and the user finds out later, if at all.

## What Changes

- **A single selection defaults to `element`.** The edit lands on the element you selected and nothing else.
- **Widening is offered after the fact, not before.** Once the edit is applied, the user is asked whether to apply it to every instance of the same component. Acting first and offering second means the narrow result is already real and the wide one is a deliberate answer to a direct question.
- **The offer is by component identity, minus the instances that already differ.** Every instance created from that component EXCEPT those whose current value for the edited property had already diverged — those were styled that way on purpose, and "apply to all" must not be a way to quietly overwrite a decision somebody made and never revisited. This keeps exactly what `c8faafc9` was protecting while fixing what was actually wrong, which was the default.
- **A multi-element selection still defaults to `selection`.** Those elements were selected on purpose.
- **Token scopes stay available and stop being automatic.** `component-token` and `token` reach beyond the page, so they are chosen, never inherited from a default.

Explicitly **not** in scope: removing any scope, changing what each scope writes, and changing the framework-page vs light-page routing of a committed edit.

## Capabilities

### Modified Capabilities
- `scoped-style-edits`: the derivation that preselects a scope changes from "widest supported" to "narrowest", and widening moves from a pre-commit control to a post-commit offer.

## Impact

| Area | Change |
|---|---|
| `packages/core/src/shared/style-scope.ts` | `deriveScope` returns `element` for a single selection; the ordering rationale is rewritten |
| Design panel edit controls | The scope control stops carrying the decision alone; a post-edit offer to widen appears |
| `packages/core/src/shared/canvas-edit-router.ts` | Unchanged in what it writes; it receives `element` far more often |

**This does NOT reverse the earlier decision** (`c8faafc9`, "apply-to-all means 'looks like this', not 'every instance'"), which an earlier draft of this proposal did. That commit protects an element somebody deliberately styled differently, and the offer here skips exactly those. What changes is only that the wide scope stopped being the DEFAULT — the part that was actually wrong — and that the offer is framed by component identity so a user reads it as "the other Buttons" rather than as a value match they have to reason about.
