## 1. Scope model (shared, no UI)

- [x] 1.1 Add a `StyleScope` type (`element` | `selection` | `component` | `token`) and a `ScopeOption` shape (scope, label, reach count or `null` when uncountable) to `packages/core/src/shared/`.
- [x] 1.2 Implement `deriveScope(selection, property)` as a pure function applying the four ordered rules from the spec; return the derived default plus the token or component name it keyed on.
- [x] 1.3 Implement `availableScopes(selection, property, page)` — omit `component` when no shared `data-component`, omit `token` when the property does not resolve through one, and compute each scope's reach count.
- [x] 1.4 Unit-test 1.2 and 1.3 exhaustively over the rule table: shared token, shared component, mixed, single element, unmarked element, uncountable reach. These are pure functions — cover every branch, not a sample.

## 2. Phase 1 — scope selector over the existing component override

- [x] 2.1 Render the scope selector in `DesignPanel`'s style fields: options from `availableScopes`, preselected by `deriveScope`, each labelled with its reach.
- [x] 2.2 Route a committed edit by scope in `RunApp.commitEdits`: `element` keeps today's path; `component` calls `setThemeComponentOverride`; `token` calls `setThemeTokenOverride`. No new IPC.
- [x] 2.3 Make the resolvability guard apply only to page-source writes, so an overlay-scoped edit on an unresolvable element still succeeds.
- [x] 2.4 List existing per-component overrides in the design-system surface — component, properties, values — with a clear action per override.
- [x] 2.5 Clear the leftover `[data-component="Button"] { border-radius: 0 }` case correctly: clearing removes the entry and the instances return to inherited values.
- [x] 2.6 Component tests: the selector shows the right options and counts; a `component`-scoped edit writes the overlay and not the page source; an `element`-scoped edit still writes page source.
- [~] 2.7 Verify by hand on AstryxTest: set a radius at `component` scope on a Button, confirm every Button on the open screen changes, then clear it from the list and confirm they revert.

## 3. Phase 2 — selection becomes a set

- [x] 3.1 Change `useInspectorBridge` from `selectedId: string | null` to `selectedIds: string[]` plus a focused member; keep a single-member selection behaviourally identical.
- [x] 3.2 Migrate every consumer — `DesignPanel`, `NodeTree`, `commitEdits`, `deleteSelected`, drag-move, comments, assistant context — to read the set and act on the focused member where fan-out is not meaningful.
- [x] 3.3 Guest bridge: additive hit-testing so a modifier-click adds or removes, and a plain click replaces.
- [x] 3.4 Canvas overlay: draw a rectangle per selected element and distinguish the focused member.
- [x] 3.5 Marquee drag on empty canvas space; modifier-marquee adds to the existing selection; a drag beginning on an element remains that element's move.
- [x] 3.6 Modifier-click multi-select in `NodeTree`, sharing one selection with the canvas in both directions.
- [x] 3.7 `Escape` clears the selection.
- [x] 3.8 Selection restore after reload: re-acquire what can be re-acquired, drop what cannot, never substitute a different element.
- [x] 3.9 Component tests: additive add/remove, plain-click replace, marquee, tree↔canvas parity, Escape, partial re-acquisition.

## 4. Phase 2 — editing a heterogeneous selection

- [x] 4.1 Compute the intersection readout: shared values shown, differing values as `Mixed`.
- [x] 4.2 Track which fields the user actually edited this interaction and write only those — a `Mixed` field left untouched is never written.
- [x] 4.3 Fan `selection`-scoped writes out per element, each independent: one member failing its resolvability guard does not block the others.
- [x] 4.4 Report the members that could not be written, by name, rather than skipping them silently.
- [x] 4.5 Make a fan-out one undo step: undoing once restores every member.
- [ ] 4.6 Make an overlay-scoped edit one undo step, including removing an override the edit created.
- [ ] 4.7 Component tests: `Mixed` is never flattened (edit padding on a mixed-radius selection, assert each radius survives); fan-out writes all members; partial failure reports.

## 4b. Revision — apply-to-all means "same style", and the design system marks what a selection uses

- [x] 4b.1 Replace the `component` scope with `matching`: same `data-component` AND the same current value for the property being edited. An element already styled differently was styled differently on purpose and is left alone.
- [x] 4b.2 Update `deriveScope` rule 2 and `availableScopes` for `matching`, and extend the unit tests — including the case that same-component-but-different-values must NOT default to `matching`.
- [x] 4b.3 Count `matching` from the live tree by (component, current value) so the label states the real set.
- [x] 4b.4 Route a `matching`-scoped commit as a fan-out over the matched elements in the page's own source, not as an overlay write.
- [x] 4b.5 Mark the design-system rows the selection resolves through, changing nothing else — no filtering, no reordering, no hiding. Clearing the selection removes the marking.
- [x] 4b.6 Component tests: a differently-styled sibling is left alone; the count matches the set written; the marking appears and clears with the selection and moves no rows.

## 5. Phase 3 — select all matching

- [x] 5.1 Implement matching by the three named criteria: same `data-component`, same tag, same binding to a given token.
- [x] 5.2 Offer the actions from a selected element, each stating its criterion and its match count before it runs.
- [x] 5.3 Select and highlight the matched set so it can be reviewed, with members removable before any edit.
- [x] 5.4 Component tests: each criterion selects the right set; the count shown equals the set selected; removing a member before editing excludes it from the write.

## 6. Phase 3 — token promotion

- [x] 6.1 Detect the promotion case: an `element`/`selection` edit that would hardcode a value onto members that all share a token for that property.
- [x] 6.2 Offer the promotion, naming the token and its use count.
- [x] 6.3 Accepting writes the token override instead of the per-element values; declining completes the original edit at the original scope, unchanged.
- [x] 6.4 Component tests: offered when shared, not offered when not shared, declining leaves the element edit intact and the token untouched.

## 7. Assistant context

- [x] 7.1 Carry a multi-selection as one context entry rather than one per element.
- [x] 7.2 State the count in the chip, and what the members share when they share a component or a token binding.
- [x] 7.3 Reflect partial re-acquisition honestly after a reload rather than claiming the original count.
- [x] 7.4 Component test: five selected renders exactly one chip naming five.

## 9. Component-scoped token values (both wide scopes, side by side)

- [x] 9.1 Add a `component-token` scope: same token, redefined only within one component, written to the durable overlay as `[data-component="X"] { --token: value }`.
- [x] 9.2 Put it above `token` in the default rule — it satisfies the same principle without spilling onto components that share the token — and extend the unit tests for the new ordering.
- [x] 9.3 Offer it only when the selection shares BOTH a component and a token for the property; count its reach as that component's instances.
- [x] 9.4 Route a `component-token` commit through `setThemeComponentOverride`, merging with any existing base so it never drops another property.
- [x] 9.5 Verify the materializer emits the scoped redefinition and that it spares sibling components — a real test, not a hand-check.
- [x] 9.6 List component-scoped token overrides in the design-system surface, clearable like any other.
- [x] 9.7 State in the UI that the scoped value reaches the component's parts, so inheritance is read rather than discovered.
- [x] 9.8 Component tests: the scope is offered and defaulted correctly, routes to the overlay, and sits alongside `matching` without either being mistaken for the other.

## 10. Tokens the design system does not define

- [x] 10.1 Compute the selection's tokens that are NOT rows in the design system, with the value each resolves to.
- [x] 10.2 List them in the design-system surface, named and marked as not part of the design system — separate from the in-place marking, so neither is mistaken for the other.
- [x] 10.3 Show nothing when there is nothing unmapped, and withdraw the list when the selection clears.
- [x] 10.4 Offer per-token adoption through the existing `createToken` path; never automatic.
- [x] 10.5 Report a failed adoption and leave the design system unchanged.
- [x] 10.6 Tests: unmapped tokens are named; a fully-mapped selection lists nothing; adopting calls the creation path with the right name and value; adoption never fires on its own.

## 8. Verification

- [x] 8.1 Full unit and component suites green across `packages/core`, `packages/ui`, and `apps/ide`. (core 1064, ui 182, CT 138 passed. 35 CT failures are PRE-EXISTING — verified by stashing every change and re-running: baseline is 35 failed / 136 passed, with the change 35 failed / 138 passed.)
- [ ] 8.2 Manual on AstryxTest: select several cards sharing `--radius-card`, confirm the default scope is `token`, and confirm the reach count matches the Library panel's use count for that token.
- [ ] 8.3 Manual on AstryxTest: select a mixed set, edit one property, and confirm no other property changed on any member.
- [x] 8.4 Confirm no new IPC channel was added — `setThemeComponentOverride` and `setThemeTokenOverride` carry both overlay scopes.
