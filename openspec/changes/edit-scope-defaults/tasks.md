> Group 1 alone fixes the reported problem. Group 2 is what makes the wide edit reachable again, and until it lands the wide scopes are still selectable in the existing control — so shipping group 1 on its own narrows the default without removing any capability.

## 1. Default to the element

- [x] 1.1 Change `deriveScope` so a single selection returns `element` regardless of component identity or token backing; keep `selection` for multi-element selections
- [x] 1.2 Rewrite the ordering rationale in `style-scope.ts` — it currently argues for predictability and then returns the widest scope, and the next person will follow the comment rather than the code
- [x] 1.3 Update the existing scope tests: the ones asserting `matching`/`component-token`/`token` as the DERIVED default now assert availability instead
- [x] 1.4 Verify a token-backed value on a component instance no longer writes the overlay or a component-scoped redefinition by default — the case that reaches other pages

## 2. Offer to widen, after the fact

- [ ] 2.1 After a single-element edit, offer applying it to every instance of that component, naming the component and the instance count
- [ ] 2.2 Make the offer's reach component IDENTITY, not current appearance — and record the departure from `c8faafc9` in the design
- [ ] 2.3 No offer when there is nothing to widen to: no component identity, or a single instance
- [ ] 2.4 Declining leaves exactly one element changed, with nothing else written
- [ ] 2.5 Accepting writes the same change to every instance, through the existing routing rather than a second write path

## 3. Verify

- [ ] 3.1 A light page: editing one instance of a repeated component changes one element in the saved file
- [ ] 3.2 The reported case end to end — the button that changed every button now changes one
- [ ] 3.3 Existing scope behaviour still reachable: every scope can still be chosen and still writes what it did
- [ ] 3.4 `/opsx:sync edit-scope-defaults`, then archive
