## 1. One metadata schema, VortSpec-owned

- [x] 1.1 Widen `componentMetadataSchema` in `packages/core/src/shared/inspector.ts` to the nine sections (`identity`, `usage`, `variants`, `aiHints`, `composition`, `behavior`, `props`, `accessibility`, `designTokens`), with `usage.antiPatterns` typed as a `{scenario, reason, alternative}` triplet that rejects bare strings
- [x] 1.2 Add the read-time legacy migration (four fields → nine sections) and an `isComplete` derivation that reports a migrated or purpose-less record as incomplete; unit-test both directions
- [x] 1.3 Add a discovery view to `main/inspector/component-metadata.ts` returning only `identity` for the whole roster, plus a full-record read for named components
- [x] 1.4 Rewrite `buildMetadataPrompt` to fill the nine sections as a transform of the Component/Interaction Specs, delegating only the analysis-derived sections (`aiHints`, `commonPatterns`, `antiPatterns`) to the `ai-component-metadata` skill; resolve `designTokens` values from `token_file` at generation time
- [x] 1.5 Extend `metadataStatusSchema` coverage reporting to distinguish missing / incomplete / complete, and surface it where coverage is shown today
- [x] 1.6 Route the full record for in-scope components and the `identity` view for the rest into grounded runs, through `safePromptField` and inside the data-not-instructions block; assert sanitation in a test
- [x] 1.7 Switch `.storybook/ComponentDocs` and the `/storybook` skill to read `.vortspec/metadata/*.json`; stop authoring `<Name>.metadata.ts` and remove the instruction to write one from `shared/compose-run.ts`
- [x] 1.8 Fold Figma doc enrichment into the metadata record so the docs page and grounded runs read the same enriched data
- [x] 1.9 Rewrite `.sdd-de/docs/component-metadata-model.md` for the new ownership and update `.sdd-de/ai-specs/skills/storybook/SKILL.md`
- [x] 1.10 Verify: `ComponentDocs` renders equivalently from the new source, and a project with no Storybook has complete metadata

## 2. Relationship graph and consumption measurement

- [x] 2.1 Add `packages/core/src/main/inspector/relationship-index.ts` building on the B2 scan cache and `FRAMEWORK_PROFILES`; key every entry on the full project-relative path
- [x] 2.2 Resolve imports per framework and emit `uses` / `usedBy` with recursive chain resolution; test the basename-collision case (`src/pages/index.*` vs `src/pages/skills/index.*`) explicitly
- [x] 2.3 Implement instance counting from template bodies — composition depth, conditionals, loops — with slot-nested instances de-duplicated; build the fixture set first and assert expected counts
- [x] 2.4 Compute `importCount`, `instanceCount` and `efficiency` per component; report imported-but-never-rendered components as unused
- [x] 2.5 Implement shadow-implementation detection (structure + token usage matching a component that is not imported), emitting `warning` severity findings that name the shadowed component and the file
- [x] 2.6 Serialize `.vortspec/ai/{index,component-usage,design-tokens}.toon` with a `generatedAt` stamp; add a TOON writer with round-trip tests
- [x] 2.7 Add the token reverse index (token → consuming components) and verify it answers without scanning component sources
- [x] 2.8 Extend `buildIndexDigest` with a bounded relationship section plus an on-demand `uses`/`usedBy` lookup; regression-test digest size against a large fixture and assert truncation is stated, not silent
- [x] 2.9 Add staleness detection (component dir mtime vs `generatedAt`), expose it to the UI, and add the CI check that fails on a stale index naming the missing components. FOLDED IN from reading the author's vendored `codebase-index` script: (a) per-framework component DIRECTORIES for the scan — the script walks `src/layouts`, `src/routes`, `app/` per framework and we only walk `src` + `component_dir`, so an Astro project's layouts are invisible today; (b) path-derived atomic tier (`/atoms/`, `/ui/`, `/layouts/`) as a fallback when the roster carries no `level` — benchmark Q3 is "list all atoms on that page" and without it a project with no roster level cannot answer Q3 at all
- [x] 2.10 DONE — benchmark harness built, token cost measured (1,051 → 1,591, +540), and 10 agent trials run (5 grounded / 5 exploring) on a 55-component fixture: 90% vs 50% overall, Q4 5/5 exact vs 0/5 with run-to-run spread, 4.6 vs 8.2 tool calls, 32.5s vs 54.6s, +18% tokens. Full write-up in docs/agentic-design-system-plan.md §1.6

## 3. Query protocols

- [x] 3.1 Generate `.vortspec/ai/rules/{metadata-schema,atomic-hierarchy,deep-tracing,load-once}.md` as part of the index build
- [x] 3.2 Reference the rule documents from grounded runs alongside the digest
- [x] 3.3 Wire `ai-ds-composer` into compose and light-page runs as the selection method, and `ai-component-metadata` behind the group 1 generation prompt
- [x] 3.4 Extend `LiteComponent` in `shared/lite-manifest.ts` with an optional framework-free `hints` block (`selectionCriteria`, variant `purpose`, anti-pattern scenarios) and serialize it into `designer.md`; assert `findFrameworkPointers` still finds nothing and that serialization throws on a leak
- [x] 3.5 Carry selection criteria and anti-patterns into light-page composition. DEVIATION: the criteria are carried in `designer.md`'s `hints` block (3.4) and `buildLightPagePrompt` carries the METHOD that makes them binding, rather than a second copy of the data. `designer.md` is already the prompt's component context; inlining every component's criteria as well would pay for the same text twice and let the two disagree. The coverage assertion therefore runs against the serialized manifest — every `data-component` name the prompt permits has its criteria present there
- [x] 3.6 Confirm a component with no metadata still appears in `designer.md` with its stand-in and does not block light-page composition
- [x] 3.7 Replace the `DESIGN.md` `.slice(0, 4000)` in `shared/compose-run.ts:295` with the structured digest plus in-scope metadata records
- [x] 3.8 DONE — the trials above ran WITH the rules present; grounded agents cited the artifacts the protocols point at (component-usage.toon for uses/usedBy) rather than grepping, which is the behaviour the rules encode. Q1's 3/5 exposed a real defect in the digest header (two different component counts under one word) — now fixed and covered by tests

## 4. Governance v2 and reports

- [x] 4.1 Define the governance rule format and seed `.vortspec/ai/governance/` with defaults for hierarchy, elevation, semantic color and typography composites
- [x] 4.2 Extend `AuditFinding.kind` beyond `hardcoded-color | token-drift` with the intent kinds, keeping the existing severity model and adding the violated rule plus a one-line correction to each finding
- [x] 4.3 Implement deterministic evaluation of each rule against the token graph and resolved values; route only genuinely judgment-bound cases to a model
- [x] 4.4 Build the fixture with a syntactically valid but hierarchy-violating token reference and assert existence-only checks pass while intent checking flags it; assert intent findings are a strict superset of the existing findings
- [ ] 4.5 Generate `.vortspec/ai/reports/adoption.md` from the group 2 index — utilization, unused components, efficiency, shadow implementations — with a `generatedAt` stamp
- [ ] 4.6 Generate `.vortspec/ai/reports/token-violations.md` grouped by component
- [ ] 4.7 Run report generation in the background on the cheapest capable model (Haiku), non-blocking, surfacing on completion
- [ ] 4.8 Surface governance findings and both reports in the Inspector Issues view, filterable by kind
- [ ] 4.9 For consume sources, assert findings are reported without writing any file in the consumed library and that corrections route to the durable overlay

## 5. AI-readiness level

- [ ] 5.1 Add `main/inspector/readiness-level.ts` computing the five-point level from metadata coverage and completeness, token determinism, governance rule count, relationship density and violation rate
- [ ] 5.2 Return the attributable signals and the specific next action that raises the level, phrased as the concrete gap rather than the level name; return no next action at the top level
- [ ] 5.3 Surface the level in the design system workspace next to the existing readiness signals, visibly distinct from them
- [ ] 5.4 Recompute the level when the index is rebuilt
- [ ] 5.5 Test the level transitions: no metadata and no governance → Libraries; complete metadata plus encoded governance → a higher level with the responsible signals attributable

## 6. Deterministic component scaffold

- [ ] 6.1 Read `.sdd-de/docs/component-standards.md` and `framework-config.md` and record the current authoritative file set per framework/language/styling combination — the scaffold codifies these, it does not invent a new standard
- [ ] 6.2 Add the scaffold in `packages/core`, driven by `.sdd-de/project.yaml`, writing the implementation, variants (only where the styling approach separates them), test file, and barrel export, plus index registration where the project uses one
- [ ] 6.3 Omit inapplicable files rather than emitting empty placeholders; assert no zero-content file is ever written
- [ ] 6.4 Emit a real smoke test per component — at least one executable assertion that it renders — and assert the project's test runner passes on a freshly scaffolded component
- [ ] 6.5 Write the `.vortspec/metadata/<name>.json` record as part of scaffolding, with `identity` fully populated and the analysis-derived sections marked incomplete
- [ ] 6.6 Assert structural determinism: scaffolding the same component twice produces the same file set at the same paths, and a missing file surfaces as a scaffold failure rather than a generation-quality issue
- [ ] 6.7 Record each component's styling surface at scaffold time, and have the audit report reduced coverage for components whose styling exposes no discrete token declarations — never report an unevaluable rule as passing
- [ ] 6.8 Assert the scaffold never writes into a consumed library's source tree for a consume-source project
- [ ] 6.9 Wire the scaffold into the component-creation path so the model supplies content into an existing file set instead of deciding which files exist; keep the SDD cycle's per-task flow intact
- [ ] 6.10 Verify: metadata coverage for a project whose components were all scaffolded reports zero missing records

## 7. Canonical token pipeline

- [x] 7.1 Agree the `$extensions` payload shape with `figma-native-token-model` (collections, modes, per-mode values, alias refs, durable variable keys) before writing either side — this is the merge point named in `design.md`
- [x] 7.2 Stop flattening on ingest: persist the `figma-cli export dtcg` tree to `.vortspec/tokens.json` unmodified, with group nesting and DTCG aliases intact
- [x] 7.3 Move `dtcgToVariables` (`figma-cli.ts:355`) to a read-time projection over the canonical artifact; keep its output shape so existing consumers don't change yet
- [x] 7.4 Assert the artifact validates as DTCG and that no design-source-specific field appears outside `$extensions`
- [x] 7.5 Add whole-file emitters from canonical for each supported styling: css-vars, scss, tailwind v3 config, tailwind v4 `@theme`, ts theme — modelled on the existing per-format writers in `token-writers.ts`
- [x] 7.6 Make the Tailwind emitter produce the curated semantic mapping the `extract-design-system` skill prescribes (scale names → tokens), never a raw arbitrary-value dump; assert standard utilities resolve to project tokens
- [x] 7.7 Fail loudly on a styling approach with no emitter — never fall back to a format the project cannot consume
- [x] 7.8 Make `token_file` a derived artifact: emission is idempotent (byte-identical on re-run), and a token file that diverged from its last emission is reported rather than overwritten
- [x] 7.9 Assert one-scan-many-emits: read the design source once, emit every supported format, and verify the source was read exactly once; verify a styling switch makes no design-source request
- [x] 7.10 Add the non-design-tool ingest path (CSS custom properties / theme object / consumed library token file) producing the same canonical artifact; for consume sources assert it is a read-only projection
- [x] 7.11 Feed `buildDeriveInput` (`lite-source.ts:86`) from the canonical artifact so `$type` values outside the five visual groups (duration, dimension) reach `designer.md` instead of being dropped by `mapTokenGroup`
- [x] 7.12 Update `extract-design-system` Step 2A: write the canonical artifact, then emit — no styling-format call to the design source
- [x] 7.13 Retire or derive `.vortspec/figma-variables.json` per the merge rule, so exactly one canonical shape remains
- [x] 7.14 Wire the pipeline to its callers — `ingestTokensFromProject` and `emitTokenFiles` have NO callers today, so nothing actually produces `token_file` and "derived artifact" is aspirational: emit at the end of both ingest paths (`syncVariablesToCache`, `ingestTokensFromProject`) per the emission-timing decision in `design.md`, add an on-demand route for a styling switch (asserting it makes no design-source read, per 7.9), surface the `diverged` and `read-only` outcomes as a user-facing choice rather than a silent no-op, and assert a Figma sync leaves `token_file` matching its ledger (i.e. a second emit reports `up-to-date`, never `diverged`)
- [x] 7.15 Stop `sync-tokens` writing `token_file` directly — it contradicts "the styling token file is a derived artifact" now that `extract-design-system` (7.12) emits it: depends on 7.14 for the machinery. Branch A step 5 collapses — a Figma variable with no code counterpart just means the artifact is stale, so re-ingest and the token appears — and Branch C/D/E step 3 ("create a token variable in the project token file") authors into `.vortspec/tokens.json` instead, since those sources have no live design tool to create it in and the artifact IS their source of truth; for Branch B (`library`, and `enterprise`) route the write to the durable overlay instead, since `token_file` there is the consumed source (7.10); update the skill's Tailwind note, which tells the agent the bridge reads a hand-maintained `tokens.css`

## 9b. From the FigJam board, not previously captured

> Read off `figma.com/board/zilsOCRmQ0EBmqwIRXe3ET` in full. Everything else on the board maps to an
> existing group; these two do not appear anywhere in the plan.

- [ ] 9b.1 Add the **Props Glossary & Lookup Table** (board Frame 241). The board feeds it from the component set INTO the AI-ready metadata, i.e. it is a cross-component index of prop name → meaning, type and accepted values, so `variant`/`size`/`tone` mean the same thing everywhere and a generator stops inventing a fourth spelling of the same prop. VortSpec has the inputs already — `metadataPropSchema` per component plus the roster — so this is a derived artifact plus a governance rule ("a prop name that exists in the glossary must match its recorded type"), not new extraction
- [ ] 9b.2 Adopt the board's **ARC vocabulary (Audit · Report · Compose)** in the query protocols of group 3, since it is the frame the benchmark scores against: each of the four questions is mapped to a phase, and the rule documents currently name none of them. Naming the phase a query belongs to is what lets a run choose "query the index" over "explore the filesystem"

## 2b. Generated validation page (audit does not wait for a user screen)

> Recorded as a decision in `design.md`. The audit, the token check and the benchmark all need a page
> that renders components; all three were implicitly blocked on the user authoring a screen first,
> which inverts the order the work happens in — components come before screens, and that is when
> token discipline is cheapest to fix.

- [x] 2b.1 Generate a validation page per TIER (atoms/molecules/organisms) that renders every component with each of its variants, written under a clearly-marked path and removed after the run unless kept. One page per tier rather than one page total, because a single page makes benchmark Q4 ("used on other pages") degenerate — with tiers, a molecule renders atoms and the reuse signal is real
- [x] 2b.2 Emit it deterministically for the JSX-family frameworks (react, next, solid, astro) and via the existing idioms prompt for the rest; FAIL LOUDLY by name for a framework with neither, exactly as the token emitters do — never write a page a project cannot compile
- [x] 2b.3 Use it as the audit and benchmark subject when the project has no entry page of its own, and record in the report WHICH subject was used — a finding measured against a generated page is weaker evidence than one measured against a real screen, and conflating them would overstate the audit
- [x] 2b.4 Offer to keep it (committed, as a reviewable "whole design system rendered" artifact) and encourage the user to run the same audit against their own screens — the generated page is the floor, not the ceiling
- [x] 2b.5 Verify: a project with no screens produces a complete audit and a runnable benchmark; a component with no variants still appears; and the page is gone afterwards unless kept

## 2c. Two audits: component creation and screen generation

> Recorded as a decision in `design.md`. Validation happens TWICE — once when components are built
> (against the generated validation pages) and once when a screen is generated into the chosen
> framework and styling. They cannot share a rule set: "this component is unused" is noise in the
> first (no screens exist yet) and one of the most valuable findings in the second, and "this markup
> reimplements a component" is impossible in the first and is the shadow finding in the second.
> Each task below is APPLY → TEST → VALIDATE.

- [x] 2c.1 APPLY: add an `AuditScope` (`component-creation` | `screen-generation`) to `AuditFinding`, and make every rule DECLARE the scopes it is valid in; a rule evaluated outside its scope is a type error, not a runtime surprise. TEST: a scope-mismatched rule fails to compile and the audit refuses to emit it. VALIDATE: the component-creation audit on a project with no screens emits ZERO "unused" and ZERO shadow findings — an audit that cries wolf is one people scroll past
- [x] 2c.2 APPLY: the component-creation audit — subject is the generated per-tier validation pages (2b), question is "does this component implement its tokens correctly": hardcoded values, token-for-role, resolved value vs the canonical artifact. TEST: a component with a hardcoded hex is caught; one that references the right token is not. VALIDATE: run it on a project with components and NO screens and confirm it is complete, not partial
- [x] 2c.3 APPLY: the screen-generation audit — subject is the user's generated screens, question is "does this screen compose components correctly AND did the conversion preserve token discipline": shadow implementations, wrong variant for context, and the conversion-introduced failures audit A structurally cannot see. TEST: a screen that inlines a component's markup is flagged; the same screen importing it is not. VALIDATE: run it after a real light-page → framework conversion
- [x] 2c.4 APPLY: make the styling approach part of the screen audit, since the conversion's output differs by target — a Tailwind arbitrary value where a scale key existed is a token-discipline failure that a CSS-modules project cannot produce, and vice versa. TEST: per-styling fixtures. VALIDATE: the same screen converted to two stylings yields the findings appropriate to each and no cross-talk
- [x] 2c.5 APPLY: report both audits distinctly — which subject, which scope, and when each last ran. TEST: a generated-page finding is never presented as equal evidence to a real-screen one (2b.3). VALIDATE: a full cycle shows audit A after component creation and audit B after screen generation, and neither is mistaken for the other

## 8. Close out

- [ ] 8.1 Run the full test suite and the CT suite; confirm no regression in the existing digest, audit, metadata and token paths
- [ ] 8.2 Record the benchmark results (accuracy, variance, false negatives, token cost) in `docs/agentic-design-system-plan.md` against the §1.6 targets
- [ ] 8.3 Resolve the design's open questions (configurable elevation scale; recompute-on-build vs on-demand; shadow detection scope for consume sources; CSS-modules recommendation; scaffold-replaces vs scaffold-precedes the cycle; whether push reads canonical) and fold the answers into the specs
- [ ] 8.4 Run `/opsx:sync` to fold the delta specs into `openspec/specs/`

## 9. Consume-source parity in the SDD-DE skills (adjacent scope — found during 7.15)

> `enterprise` is a first-class design source in the APP — it is in `DESIGN_SOURCE_OPTIONS`
> ("Connect Enterprise Design System"), `isConsumeSource` covers it, and `theme_apply` resolves it to
> `overlay-injected` — but the `.sdd-de` skills have never heard of it. Four skills carry a five-way
> branch table keyed on `design_source` (`setup`, `enrich-brief`, `generate-artifacts`,
> `visual-verify`) and none of them names `enterprise`, so a project created through the app's own
> enterprise flow matches NO branch and the agent improvises — most likely down Branch A, the Figma
> path, for a project that has no Figma file. This is a pre-existing defect, not something this
> change introduced; it is recorded here because 7.15 is what surfaced it, and it could reasonably be
> split into its own change.

- [ ] 9.1 Add `enterprise` to `setup`'s design-source question and give it a branch — the skill can currently only produce five of the six sources the app supports, so a config the app writes cannot be written by `/setup`; the branch asks the consume-source questions (library/package or repo to consume, its Storybook/docs URL if any, where its tokens live) and records `token_file` as a POINTER to the consumed source rather than a path VortSpec will write
- [ ] 9.2 Route `enterprise` through the consume branch in `enrich-brief`, `generate-artifacts` and `visual-verify` — retitle each "Branch B — Component Library Flow (`design_source: library | enterprise`)" and state the consume rules the branch implies: the base component comes from the consumed library and is never recreated, customization is an overlay rather than a fork, and `visual-verify` references the vendor's own docs/Storybook rather than a Figma frame
- [ ] 9.3 Assert the parity rather than trusting the prose: a test over the skill files that every `design_source` value in `DESIGN_SOURCE_OPTIONS` is named by a branch in each branching skill, so the next source added to the app cannot silently lack a branch
