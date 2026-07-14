## 1. Contracts

- [x] 1.1 Add resolver types to `packages/core/src/shared/inspector.ts`: `matchSignal` enum (`link|name|value|alias|none`), `resolveResult` (`match?`, `signal`, `suggestions?`), `tokenLink` schema, and `orphanReport` / `duplicateReport` shapes.
- [x] 1.2 Add the `.vortspec/token-links.json` shape (code-token normName → figma path, optional mode) to the shared contracts.
- [x] 1.3 Keep all new fields additive/optional so existing token results validate unchanged.

## 2. Resolver (core)

- [x] 2.1 New `packages/core/src/main/inspector/token-resolver.ts`: `resolveToken(candidate, index, { mode })` implementing link → name → value → alias precedence, reusing `normName`, `normValue`, `variableValueInMode`.
- [x] 2.2 Value layer: mode-aware; auto-resolve only on a unique candidate, else return `suggestions` (D2).
- [x] 2.3 Alias layer: match by shared alias-graph target (a code `var(--x)` vs a Figma alias to the same primitive).
- [x] 2.4 Link store: read/write `.vortspec/token-links.json` (local-first, like `token-overrides.json`); links read first; dangling target → `none` + stale flag.
- [x] 2.5 Unit-test each signal + precedence + ambiguity + stale-link, with fixtures drawn from the Excellus data (4/11 name, 7/11 value).

## 3. Reconcile via the resolver

- [x] 3.1 Route `reconcile()` / `getInspectorTokens` through `resolveToken` (value/link/alias on top of name); behavior-compatible when only names are used.
- [x] 3.2 Represent the match signal on each reconciled token (so the UI can show "matched by value/link").
- [x] 3.3 Unit-test: value-equal token under a different name reconciles instead of showing unmatched.

## 4. Dedup-before-create + sanitation analysis

- [x] 4.1 Route `createInspectorToken` + literal promotion through the resolver; refuse to create on a match, return the reused token + message.
- [x] 4.2 Orphan detection: tokens resolving to `none`, each with usages from `buildUsage` (component + section/property).
- [x] 4.3 Duplicate + flattened-semantic analysis over the token set; exclude cross-brand primitive collisions (D7).
- [x] 4.4 Unit-test dedup refusal, orphan report (with usages), duplicate/flattened detection, cross-brand exclusion.

## 5. Push-back + collapse

- [ ] 5.1 Orphan push: build a plan via `computePushPlan` (layered routing/aliasing) for the confirmed orphan set; gated.
- [ ] 5.2 Collapse action: re-alias a duplicate/ flattened semantic to its canonical token in the token file, gated + previewed.
- [ ] 5.3 IPC + preload + api wiring for: resolve, orphan/duplicate report, write link, push orphans, collapse.
- [ ] 5.4 Unit-test push-plan for orphans + gated collapse rewrite.

## 6. UI (Inspector)

- [ ] 6.1 Show the match signal on tokens (name/value/link/alias) and a link-confirm affordance for ambiguous/suggested matches.
- [ ] 6.2 Duplicates section: value-equal tokens grouped, with a gated "collapse to canonical" action.
- [ ] 6.3 Orphans prompt: batched list with where-used and a single "Add to Figma" (push-back) action; dismiss leaves Figma untouched.
- [ ] 6.4 Dedup-on-create feedback: when creation is refused, show which existing token was reused.

## 7. Component-token binding

- [ ] 7.1 At component generation, resolve each Figma-bound variable → project token via the resolver; emit `var(--match)`.
- [ ] 7.2 On `none`, surface (dedup-checked create or orphan flag) — never hardcode a hex or emit a raw Figma name / broken ref.
- [ ] 7.3 Validate on the Excellus Accordion: 11/11 bindings resolve to real project tokens (4 name + 7 value), zero hardcoded values.

## 8. Docs + verification

- [ ] 8.1 Short doc: the layered resolver + sanitation model and the `.vortspec/token-links.json` contract.
- [ ] 8.2 Prototype/validate end-to-end against the Excellus project: reconcile (no false unmatched), dedup (no new tokens for existing values), orphan report with where-used, and a rename-survives-via-link check.
- [ ] 8.3 `pnpm build && pnpm test && pnpm lint` green.
