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
- [x] 2.4 Surface the palette as a browsable "design system" view in the Playground/IDE (packages/ui), distinct from real Storybook. → WIRED end-to-end + all 3 packages typecheck clean: `lite:palette`/`lite:writeDesigner` IPC (contract+handler+preload+api) → `main/lite/lite-source.ts` orchestrator → `packages/ui/src/views/DesignSystem.tsx` (sandboxed iframe) → ActivityBar "Design system" entry + App router branch + ui export. ⚠️ Live render is USER-verified (build+run the IDE) — I can't drive the packaged GUI.
- [x] 2.5 Verify: palette renders every contract component before any framework component exists; real Storybook still generated separately. → 9 tests in `palette.test.ts` (renders every component incl. placeholders; Storybook untouched)

## 3. Component stand-ins — derived from Figma (NOT Storybook — design D4, per user correction)

- [~] 3.1 Read each component's Figma node ONCE via the read-only Figma MCP and emit a framework-free, token-referenced HTML stand-in FIRST (immediate live preview), reusing the existing `get_design_context` recipe; framework components generated sequentially after (design D5). → BUILT: `shared/light-standin.ts` — `buildLightStandInPrompt()` (reuses the read recipe, one-read/light-first sequence, forbids framework pointers, writes `.vortspec/light-html/<component>/<variant>.html`) + `readFigmaStandIns()` in `main/lite/lite-source.ts` wires the emitted files into the palette + `designer.md` (skips any that leaked framework pointers). 6 prompt tests. ORCHESTRATION built: `buildStandInTargets`/`buildProjectStandInPrompt` (main), IPC `lite:standInPrompt`, and a "Generate previews from Figma" button in `DesignSystem.tsx` that runs the agent via `useAgentRun` (bypassPermissions → Figma MCP) and refreshes on done. Remaining (live): click it with Figma connected + verify real previews replace placeholders.
- [x] 3.2 Emit the Figma-derived stand-in as the component's stand-in (name + variant keyed) and write it into `designer.md`. → `harvestStandIn()` → `StandIn`; name-keyed via `DeriveInput.standIns`; serialized by `serializeLiteManifest`.
- [x] 3.3 Placeholder path: a minimal marked stand-in before the Figma-derived one exists. → `placeholderStandIns()` in `lite-manifest.ts` (marked `source:"placeholder"`; palette badges it).
- [x] 3.4 Merge/replace stand-ins as better data arrives (Figma-derived replaces placeholder). → `mergeHarvestedStandIns()` (derived variants win; others kept; new ones appended) + tests.
- [~] 3.5 Verify: a Figma-derived stand-in reflects the component's design + is framework-free; placeholder is clearly marked until replaced. → STRUCTURE + framework-free purity + placeholder-marking verified by 10 tests. The Figma-node read + visual fidelity needs the live extraction step.

## 4. Contract-first parallel build + readiness

- [x] 4.1 Establish the shared contract as the single identity source both tracks build to (reuse `extract-design-system` output; no second Figma read). → `ContractIdentity` is the authority in `packages/core/src/shared/readiness.ts`; readiness/convergence are computed against it (consumes `components.json`; no new Figma read).
- [ ] 4.2 Wire the two tracks: fast light track (contract → palette) and background framework track (contract → 7-step cycle) running concurrently. → DEFERRED (batched live): agent-run orchestration; the model here feeds it.
- [x] 4.3 Add per-component readiness state (`light-only` / `framework-ready`) and the transition on framework completion + harvest. → `computeReadiness()` (framework-ready iff exists AND every variant harvested).
- [ ] 4.4 Surface readiness in the Playground (mark catching-up components). → DEFERRED (batched live UI); data ready via `buildReadinessReport().catchingUp`.
- [x] 4.5 Add the convergence assertion: a component's light and framework identities (name + variants + props) match the contract. → `convergenceIssues()` + report `diverged` (name/variant/prop drift).
- [x] 4.6 Verify: light shelf usable immediately after extraction; readiness flips correctly as framework components land. → 13 tests: `paletteUsable` true independent of framework; readiness flips on exists+harvest; drift surfaced.

## 5. Soft Screen Creation gate

- [ ] 5.1 Allow page composition against `light-only` components (remove the hard "all components first" block for composition). → DEFERRED (live): VortSpec's compose softly gates on a non-empty ROSTER (`ComposePanel` "components first", `useComposeRun` §6.4); the change is to make the light palette's components count in the roster. Integration + live verify.
- [x] 5.2 Gate page→framework compile per component on `framework-ready`; report and name blocking `light-only` components. → CORE done: `compileBlockers()` in `readiness.ts` (names the not-yet-ready components). Wiring into the compile flow lands with group 6.
- [ ] 5.3 Update CLAUDE.md's Screen Creation prerequisites to the soft, per-component gate (docs). → DEFERRED to ship-time per design.md migration §5 ("once the flow is proven"); boundary-sensitive — do NOT edit the SDD-DE toolkit CLAUDE.md gate before the flow ships.
- [ ] 5.4 Verify: composing with not-ready components works; compiling names the blockers; a fully-ready page compiles with no block. → compile-blocker naming is unit-tested (readiness); compose-with-not-ready + fully-ready-compiles are live (need group 6 + roster wiring).

## 6. Deterministic light→framework compile (React-CVA first)

- [x] 6.1 Map a light-authored page's node tree to framework code reusing the framework-free node-tree projection + reconciler and the compose-run flow. → `compileLightPage()` in `packages/core/src/shared/compile.ts` (deterministic tree → React/CVA JSX). Import emission + slot insertion via compose-run is the live wiring layered on top.
- [x] 6.2 Restore token references from embedded values via the recorded token name; never invent a token. → `styleProp()` swaps values → `valueToTokenRef`; unmapped known-token values become residual (never a new token).
- [x] 6.3 Map light component usages → real CVA components by contract identity (name + variant) and `data-component` markers. → `emitComponent()` → `<Name variant=… />`; `usedComponents` recorded for imports + the compile gate.
- [x] 6.4 Add a token-discipline lint on compiled output: no known-token literal (hex/px) leaks as a raw value. → `lintIssues` flags any `knownTokenValues` literal emitted raw.
- [x] 6.5 Measure the deterministic-vs-AI split of the React-CVA compile and record it (informs multi-framework feasibility). → `deterministicCoverage` (tokensRestored / literalsKept / componentsMapped / residual) + `isFullyDeterministic()`.
- [x] 6.6 Verify: a page composed on the light surface compiles to framework code that references real components and tokens, with the lint passing. → 9 tests (component mapping, token restoration, lint leak + clean, nesting, escaping). Full compose→compile e2e lands in group 7 (live).

## 7. Ship

- [ ] 7.1 End-to-end validation on a real Figma-extracted project: extract → light shelf in minutes → compose a page → framework catches up → compile.
- [ ] 7.2 Confirm invariants: no direct Figma, real Storybook preserved, token discipline end-to-end, single source of truth per phase.
- [ ] 7.3 Document the flow (skill/docs) and keep the old hard-gated path available as fallback until proven.
