## 1. Lite manifest (`designer.md`)

- [x] 1.1 Define the `designer.md` schema: dual-keyed tokens (name + resolved value), foundations (spacing/margins/padding/tokens), and per-component stand-in entries keyed by name + variant. → VortSpec-native types in `packages/core/src/shared/lite-manifest.ts` (`LiteManifest`, `LiteToken`, `StandIn`, …)
- [x] 1.2 Implement the derivation from `DESIGN.md` + `components.json` + Component Specs: pull resolved token values, the token→css-property map, variants, sizes-in-px, and states — no re-derivation. → pure `deriveLiteManifest()` + `serializeLiteManifest()` in `lite-manifest.ts` (fs/reader orchestration in `main/` follows in a later task)
- [x] 1.3 Strip all framework/Storybook pointers (JSX imports, `.variants.ts`, `localhost:6006`, `@/…`) so the manifest is a coherent light-only world. → `findFrameworkPointers()` guard; `serializeLiteManifest` throws on any leak
- [x] 1.4 Make generation idempotent: regenerate on extraction / `DESIGN.md` change; never preserve hand edits as authoritative. → derivation is a pure projection of its inputs (no merge/state); orchestrator will overwrite in place
- [x] 1.5 Verify: generated `designer.md` for a sample contract contains no framework pointers and every token carries name + value. → 9 unit tests in `lite-manifest.test.ts` (all green)

## 2. Light "design system" palette

- [x] 2.1 Build the fast/low-cost (Haiku-tier) generator: contract + `designer.md` → light HTML/CSS/JS shelf entry per component, styled from resolved token values, no framework runtime. → `renderPaletteHtml()` in `packages/core/src/shared/palette.ts` (self-contained HTML, inline styles from resolved values)
- [x] 2.2 Generate the visual-reference section: components, spacing, margins, padding, tokens — each with resolved value. → `buildPalette()` foundations + `renderTokenGroup`/`renderScale` (colors/type/spacing/margins/padding/shadows/radius swatches with resolved values)
- [x] 2.3 Enforce the no-direct-Figma constraint: generator reads only extracted artifacts; add a check that it makes no Figma call. → pure over the manifest (no network); `paletteSelfContainmentIssues()` guard = no `<script>`/external assets; `findFrameworkPointers()` guard on stand-ins
- [ ] 2.4 Surface the palette as a browsable "design system" view in the Playground/IDE (packages/ui), distinct from real Storybook. → NEXT: IPC (designer.md → palette HTML) + a `DesignSystem` iframe view + rail entry; needs live verification in the app
- [x] 2.5 Verify: palette renders every contract component before any framework component exists; real Storybook still generated separately. → 9 tests in `palette.test.ts` (renders every component incl. placeholders; Storybook untouched)

## 3. Component stand-in harvest

- [~] 3.1 Implement harvest: for each framework component's Storybook stories (per variant/state), snapshot real rendered DOM + computed styles via the inspector-bridge structure-snapshot machinery. → TRANSFORM done: `standInHtml()` + `HARVEST_STYLE_PROPS` in `packages/core/src/shared/harvest.ts`. Deferred (batched live pass): the preload `buildHarvestSnapshot` DOM walk that produces `HarvestNode` trees against Storybook.
- [x] 3.2 Freeze the snapshot as the component's framework-free stand-in (name + variant keyed) and write it into `designer.md`. → `harvestStandIn()` → `StandIn{source:"harvested"}`; name-keyed via `DeriveInput.standIns`; serialized by `serializeLiteManifest`.
- [x] 3.3 Placeholder path: before a framework component exists, emit a fast Figma-derived stand-in marked as placeholder. → `placeholderStandIns()` in `lite-manifest.ts` (marked `source:"placeholder"`; palette badges it).
- [x] 3.4 On `framework-ready`, replace the placeholder stand-in with the harvested real render. → `mergeHarvestedStandIns()` (harvested variants win; others kept; new ones appended) + tests.
- [~] 3.5 Verify: a harvested stand-in visually matches the real component render; placeholder is clearly marked until replaced. → STRUCTURE + framework-free purity + placeholder-marking verified by 10 tests. Visual-match-to-real-render needs the live capture (with 3.1's deferred DOM walk).

## 4. Contract-first parallel build + readiness

- [x] 4.1 Establish the shared contract as the single identity source both tracks build to (reuse `extract-design-system` output; no second Figma read). → `ContractIdentity` is the authority in `packages/core/src/shared/readiness.ts`; readiness/convergence are computed against it (consumes `components.json`; no new Figma read).
- [ ] 4.2 Wire the two tracks: fast light track (contract → palette) and background framework track (contract → 7-step cycle) running concurrently. → DEFERRED (batched live): agent-run orchestration; the model here feeds it.
- [x] 4.3 Add per-component readiness state (`light-only` / `framework-ready`) and the transition on framework completion + harvest. → `computeReadiness()` (framework-ready iff exists AND every variant harvested).
- [ ] 4.4 Surface readiness in the Playground (mark catching-up components). → DEFERRED (batched live UI); data ready via `buildReadinessReport().catchingUp`.
- [x] 4.5 Add the convergence assertion: a component's light and framework identities (name + variants + props) match the contract. → `convergenceIssues()` + report `diverged` (name/variant/prop drift).
- [x] 4.6 Verify: light shelf usable immediately after extraction; readiness flips correctly as framework components land. → 13 tests: `paletteUsable` true independent of framework; readiness flips on exists+harvest; drift surfaced.

## 5. Soft Screen Creation gate

- [ ] 5.1 Allow page composition against `light-only` components (remove the hard "all components first" block for composition).
- [ ] 5.2 Gate page→framework compile per component on `framework-ready`; report and name blocking `light-only` components.
- [ ] 5.3 Update CLAUDE.md's Screen Creation prerequisites to the soft, per-component gate (docs).
- [ ] 5.4 Verify: composing with not-ready components works; compiling names the blockers; a fully-ready page compiles with no block.

## 6. Deterministic light→framework compile (React-CVA first)

- [ ] 6.1 Map a light-authored page's node tree to framework code reusing the framework-free node-tree projection + reconciler and the compose-run flow.
- [ ] 6.2 Restore token references from embedded values via the recorded token name; never invent a token.
- [ ] 6.3 Map light component usages → real CVA components by contract identity (name + variant) and `data-component` markers.
- [ ] 6.4 Add a token-discipline lint on compiled output: no known-token literal (hex/px) leaks as a raw value.
- [ ] 6.5 Measure the deterministic-vs-AI split of the React-CVA compile and record it (informs multi-framework feasibility).
- [ ] 6.6 Verify: a page composed on the light surface compiles to framework code that references real components and tokens, with the lint passing.

## 7. Ship

- [ ] 7.1 End-to-end validation on a real Figma-extracted project: extract → light shelf in minutes → compose a page → framework catches up → compile.
- [ ] 7.2 Confirm invariants: no direct Figma, real Storybook preserved, token discipline end-to-end, single source of truth per phase.
- [ ] 7.3 Document the flow (skill/docs) and keep the old hard-gated path available as fallback until proven.
