## 1. One metadata schema, VortSpec-owned

- [ ] 1.1 Widen `componentMetadataSchema` in `packages/core/src/shared/inspector.ts` to the nine sections (`identity`, `usage`, `variants`, `aiHints`, `composition`, `behavior`, `props`, `accessibility`, `designTokens`), with `usage.antiPatterns` typed as a `{scenario, reason, alternative}` triplet that rejects bare strings
- [ ] 1.2 Add the read-time legacy migration (four fields → nine sections) and an `isComplete` derivation that reports a migrated or purpose-less record as incomplete; unit-test both directions
- [ ] 1.3 Add a discovery view to `main/inspector/component-metadata.ts` returning only `identity` for the whole roster, plus a full-record read for named components
- [ ] 1.4 Rewrite `buildMetadataPrompt` to fill the nine sections as a transform of the Component/Interaction Specs, delegating only the analysis-derived sections (`aiHints`, `commonPatterns`, `antiPatterns`) to the `ai-component-metadata` skill; resolve `designTokens` values from `token_file` at generation time
- [ ] 1.5 Extend `metadataStatusSchema` coverage reporting to distinguish missing / incomplete / complete, and surface it where coverage is shown today
- [ ] 1.6 Route the full record for in-scope components and the `identity` view for the rest into grounded runs, through `safePromptField` and inside the data-not-instructions block; assert sanitation in a test
- [ ] 1.7 Switch `.storybook/ComponentDocs` and the `/storybook` skill to read `.vortspec/metadata/*.json`; stop authoring `<Name>.metadata.ts` and remove the instruction to write one from `shared/compose-run.ts`
- [ ] 1.8 Fold Figma doc enrichment into the metadata record so the docs page and grounded runs read the same enriched data
- [ ] 1.9 Rewrite `.sdd-de/docs/component-metadata-model.md` for the new ownership and update `.sdd-de/ai-specs/skills/storybook/SKILL.md`
- [ ] 1.10 Verify: `ComponentDocs` renders equivalently from the new source, and a project with no Storybook has complete metadata

## 2. Relationship graph and consumption measurement

- [ ] 2.1 Add `packages/core/src/main/inspector/relationship-index.ts` building on the B2 scan cache and `FRAMEWORK_PROFILES`; key every entry on the full project-relative path
- [ ] 2.2 Resolve imports per framework and emit `uses` / `usedBy` with recursive chain resolution; test the basename-collision case (`src/pages/index.*` vs `src/pages/skills/index.*`) explicitly
- [ ] 2.3 Implement instance counting from template bodies — composition depth, conditionals, loops — with slot-nested instances de-duplicated; build the fixture set first and assert expected counts
- [ ] 2.4 Compute `importCount`, `instanceCount` and `efficiency` per component; report imported-but-never-rendered components as unused
- [ ] 2.5 Implement shadow-implementation detection (structure + token usage matching a component that is not imported), emitting `warning` severity findings that name the shadowed component and the file
- [ ] 2.6 Serialize `.vortspec/ai/{index,component-usage,design-tokens}.toon` with a `generatedAt` stamp; add a TOON writer with round-trip tests
- [ ] 2.7 Add the token reverse index (token → consuming components) and verify it answers without scanning component sources
- [ ] 2.8 Extend `buildIndexDigest` with a bounded relationship section plus an on-demand `uses`/`usedBy` lookup; regression-test digest size against a large fixture and assert truncation is stated, not silent
- [ ] 2.9 Add staleness detection (component dir mtime vs `generatedAt`), expose it to the UI, and add the CI check that fails on a stale index naming the missing components
- [ ] 2.10 Verify: run the four benchmark questions from `docs/agentic-design-system-plan.md` §1.6 against a real project with and without the index; record accuracy, variance and token cost

## 3. Query protocols

- [ ] 3.1 Generate `.vortspec/ai/rules/{metadata-schema,atomic-hierarchy,deep-tracing,load-once}.md` as part of the index build
- [ ] 3.2 Reference the rule documents from grounded runs alongside the digest
- [ ] 3.3 Wire `ai-ds-composer` into compose and light-page runs as the selection method, and `ai-component-metadata` behind the group 1 generation prompt
- [ ] 3.4 Extend `LiteComponent` in `shared/lite-manifest.ts` with an optional framework-free `hints` block (`selectionCriteria`, variant `purpose`, anti-pattern scenarios) and serialize it into `designer.md`; assert `findFrameworkPointers` still finds nothing and that serialization throws on a leak
- [ ] 3.5 Carry selection criteria and anti-patterns for in-scope components in `buildLightPagePrompt`; assert every `data-component` the prompt permits has its criteria present
- [ ] 3.6 Confirm a component with no metadata still appears in `designer.md` with its stand-in and does not block light-page composition
- [ ] 3.7 Replace the `DESIGN.md` `.slice(0, 4000)` in `shared/compose-run.ts:295` with the structured digest plus in-scope metadata records
- [ ] 3.8 Verify: re-run the benchmark questions with rules present and compare against the group 2 baseline

## 4. Governance v2 and reports

- [ ] 4.1 Define the governance rule format and seed `.vortspec/ai/governance/` with defaults for hierarchy, elevation, semantic color and typography composites
- [ ] 4.2 Extend `AuditFinding.kind` beyond `hardcoded-color | token-drift` with the intent kinds, keeping the existing severity model and adding the violated rule plus a one-line correction to each finding
- [ ] 4.3 Implement deterministic evaluation of each rule against the token graph and resolved values; route only genuinely judgment-bound cases to a model
- [ ] 4.4 Build the fixture with a syntactically valid but hierarchy-violating token reference and assert existence-only checks pass while intent checking flags it; assert intent findings are a strict superset of the existing findings
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

## 7. Close out

- [ ] 7.1 Run the full test suite and the CT suite; confirm no regression in the existing digest, audit and metadata paths
- [ ] 7.2 Record the benchmark results (accuracy, variance, false negatives, token cost) in `docs/agentic-design-system-plan.md` against the §1.6 targets
- [ ] 7.3 Resolve the design's open questions (configurable elevation scale; recompute-on-build vs on-demand; shadow detection scope for consume sources; CSS-modules recommendation; scaffold-replaces vs scaffold-precedes the cycle) and fold the answers into the specs
- [ ] 7.4 Run `/opsx:sync` to fold the delta specs into `openspec/specs/`
