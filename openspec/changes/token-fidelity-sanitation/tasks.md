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

- [x] 5.1 Orphan push: build a plan via `computePushPlan` (layered routing/aliasing) for the confirmed orphan set; gated. → `computeOrphanPushPlan(tokens, orphanNames, figmaVars, opts)` restricts the push to exactly the confirmed orphan names (normalized), reusing `computePushPlan` so each entry is layer-routed + aliases an existing sibling; in-sync raced tokens are skipped (no duplicate). IPC `figma:computeOrphanPushPlan` + preload + api wired; feeds the existing `figma:pushVariables` apply flow.
- [x] 5.2 Collapse action: re-alias a duplicate/ flattened semantic to its canonical token in the token file, gated + previewed.
- [x] 5.3 IPC + preload + api wiring for: resolve, orphan/duplicate report, write link, push orphans, collapse.
- [x] 5.4 Unit-test push-plan for orphans + gated collapse rewrite. → Orphan push-plan: 3 tests in
  `figma-push.test.ts` (confirmed-set only, all `create`, matched/unconfirmed excluded, gated to real
  tokens, in-sync raced token skipped). Collapse rewrite: `token-collapse.test.ts` (re-points a duplicate
  to alias the canonical token; no-op onto itself).

## 6. UI (Inspector)

- [x] 6.1 Show the match signal on tokens (name/value/link/alias) and a link-confirm affordance for ambiguous/suggested matches. → The token drawer's Figma-variable panel shows a "matched by {signal}" badge (name suppressed as the obvious case; value/alias/key/link surfaced, each with an explanatory tooltip via `MATCH_SIGNAL_META`), and a "Pin this match →" button on an inferred value/alias/key match that persists a durable link (`api.linkToken` → `.vortspec/token-links.json`) so it survives a rename; a `link` match shows "✓ linked".
- [x] 6.2 Duplicates section: value-equal tokens grouped, with a gated "collapse to canonical" action.
- [x] 6.3 Orphans prompt: batched list with where-used and a single "Add to Figma" (push-back) action; dismiss leaves Figma untouched.
- [x] 6.4 Dedup-on-create feedback: when creation is refused, show which existing token was reused.

## 7. Component-token binding

- [x] 7.1 At component generation, resolve each Figma-bound variable → project token via the resolver; emit `var(--match)`. → `resolveComponentBindings(bindings, projectTokens, {links})` maps each binding through `resolveToken` (link→name→value→alias) to `var(--token)`; the `DESIGN_REFERENCE_CLAUSE` build prompt (all component-gen paths) now carries the explicit TOKEN BINDING rule. Tests: 11/11 Accordion bindings emit `var(--…)`, zero hardcoded, + a prompt-content test.
- [x] 7.2 On `none`, surface (dedup-checked create or orphan flag) — never hardcode a hex or emit a raw Figma name / broken ref. → `ComponentBindingResult` returns `css:null`+`signal:"none"`(+suggestions) on no match; the prompt requires a dedup-checked token create (reuse an existing same-value token) before referencing, and forbids inlining the literal / raw Figma name / dangling `var()`.
- [x] 7.3 Validate on the Excellus Accordion: 11/11 bindings resolve to real project tokens (4 name + 7 value), zero hardcoded values.

## 8. Docs + verification

- [x] 8.1 Short doc: the layered resolver + sanitation model and the `.vortspec/token-links.json` contract. → `docs/token-fidelity.md`.
- [~] 8.2 Prototype/validate end-to-end against the Excellus project: reconcile (no false unmatched), dedup (no new tokens for existing values), orphan report with where-used, and a rename-survives-via-link check. → Covered at the fixture level by Excellus-derived unit tests: reconcile-by-value (`token-resolve-reconcile.test.ts`), dedup-refusal + orphan-with-usages (`token-sanitation.test.ts`), collapse (`token-collapse.test.ts`), 11/11 component binding (`token-resolver.test.ts`), and link precedence/stale-link. A live run against the actual Excellus project is the user's to perform (project data isn't in-repo).
- [x] 8.3 `pnpm build && pnpm test && pnpm lint` green. → build 4/4, tests (core 861 · ui 143 · ide 19), lint 4/4, check-types 6/6 all pass.
