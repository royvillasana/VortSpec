## 1. Root-cause confirmation (current vs previous)

- [x] 1.1 Document, with quoted lines from `packages/core/src/shared/sdd-prompts.ts`, that `buildOnePrompt`/`buildChunkPrompt` build from name + tokens only and never reference the Figma design.
- [x] 1.2 Confirm against a real reference file (TokenUpdate) that the Figma pages lack per-component frames, so the current visual-verify has nothing to compare — capture the page list as evidence.
- [x] 1.3 Identify how the earlier, better-matching approach anchored to the design (git history / archived prompts) and record which anchor was lost. → `newComponentFromFigmaNodePrompt` (build-from-selection) is the only node-anchored path; the bulk build never had a design anchor.

## 2. Figma component reference (`figma-component-reference`)

- [x] 2.1 Add discovery that lists Figma pages and matches each page name to a roster component using normalized names. → `RESCAN_PROMPT` matches each roster entry to its page by NORMALIZED name (agent-executed via the Figma MCP, per invariant #1 — VortSpec is the cockpit, not a re-implemented Figma pipeline).
- [x] 2.2 Build a durable roster→page mapping, recording unmapped components explicitly instead of guessing. → `RESCAN_PROMPT` records `figmaPage`/`figmaPageId` per entry in `.sdd-de/components.json` and sets `"unreferenced": true` on entries with no matching page.
- [x] 2.3 Add per-component reference retrieval via the Figma MCP: variant structure and a reference screenshot. → `DESIGN_REFERENCE_CLAUSE` + verify Layer 1 instruct the agent to read the page's frames/variants and view its screenshot via the Figma MCP.
- [~] 2.4 Bridge-unavailable returns "reference unavailable", not empty-success → done (clause: unreachable MCP ⇒ mark unreferenced, never fabricate). A separate TS reference cache was intentionally NOT added — the durable record is `components.json`; a parallel cache would be speculative infra (invariant #7/altitude).
- [x] 2.5 Test mapping + unavailable path → `sdd-prompts.test.ts` asserts the page-recording, normalized-match, unreferenced, and utility-page-exclusion instructions (the mapping is agent-side, so it is covered at the prompt contract).

## 3. Design-anchored build (`design-anchored-build`)

- [x] 3.1 Thread the component reference into `buildOnePrompt`/`buildChunkPrompt`/`BUILD_REMAINING_PROMPT`/`buildVerifyRestPrompt`; the instruction is now "reproduce the referenced design, tokens for values only," not "using only the extracted tokens."
- [x] 3.2 Preserve the collapsed-variant-set rule: one component covering all referenced variants (`VARIANT_SET_CLAUSE` retained).
- [x] 3.3 Make the reference take precedence over the index digest for that component's shape (explicit clause line).
- [x] 3.4 Handle the no-reference case: build nothing, mark unreferenced; never fabricate from the name.
- [x] 3.5 Update `sdd-prompts.test.ts` for the new build behavior (reference present, name-inference forbidden, no-reference).

## 4. Visual → token → code validation gate (`visual-validation-gate`)

- [x] 4.1 Extend `verifyPrompt` to run the three layers in order and report each outcome independently.
- [x] 4.2 Visual layer: `/visual-verify` renders and compares each variant/state to the reference, names concrete differences; no render surface → BLOCKED, never PASS; compiles-but-mismatches still FAILS.
- [x] 4.3 Token layer: confirm the reference's tokens are used; flag hardcoded values / wrong-token substitutions.
- [x] 4.4 Code layer: keep the compile/build gate (`tsc --noEmit`, `build-storybook`).
- [x] 4.5 Mark "verified" only when all three layers pass on real evidence; otherwise "issues"/"blocked".
- [x] 4.6 Verify routes to Haiku; chunk builds route by `tierForChunk` (atoms/molecules→Haiku, organism→Sonnet) — no Sonnet/Opus default. (Already in place from the cost-optimization work; confirmed unchanged.)
- [x] 4.7 Updated `sdd-prompts.test.ts` (visual-first order, evidence gate); `run-progress.ts` verdict regex already matches the new `<name>: ISSUES (visual|token|code: …)` line format — verified, no change needed.

## 5. Guided-flow surfacing

- [x] 5.1 A visual mismatch is visible, not masked as verified → `reportUnresolved` in `component-reader.ts` keeps any component with a failed/blocked VISUAL/TOKEN/CODE layer (or an ISSUES/BLOCKED verdict) out of "verified"; the roster renders it as "issues". Unit-tested. (Per-layer status chips in the roster UI remain a follow-up; the correctness gate — never falsely verified — is done.)
- [x] 5.2 Verify harness + fix-it: `ensureHarness` starts Storybook and the run label shows "source-only (start the preview…)" when no surface came up; verify reports BLOCKED rather than a false PASS. (Pre-existing infra, confirmed to cover the requirement.)

## 6. Methodology + release

- [x] 6.1 Documented the page-per-component convention in `@royvillasana/sdd-de` and re-wired VortSpec. SDD-DE `1.10.0` published & live: `component-standards.md` convention section, `generate-artifacts` (Figma) resolves the reference page first, `visual-verify` runs visual→token→code + emits the machine-readable VISUAL/TOKEN/CODE/VERIFY block that VortSpec's `reportUnresolved` parses. Both apps bumped to `^1.10.0`, `pnpm install` resolved 1.10.0 into the lockfile, tests/typecheck/lint green.
- [ ] 6.2 End-to-end validation on TokenUpdate (alert builds to match, only verifies after a real visual compare). Manual UI run — requires launching the app and rebuilding against the reference file; deferred to a hands-on session (milestone DoD check).
- [x] 6.3 `pnpm test`, `pnpm check-types`, `pnpm lint` green across both shells — 330 core tests + 23 prompt + 21 reader tests pass, typecheck + lint clean.
