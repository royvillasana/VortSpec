## Context

VortSpec drives the user's Claude Code through the SDD-DE cycle to build a component library from a Figma design system. The current bulk build (`buildOnePrompt` / `buildChunkPrompt` in `packages/core/src/shared/sdd-prompts.ts`) instructs the agent to "implement the `<name>` component … using ONLY the extracted design tokens." The agent therefore synthesizes each component from its **name plus a flat token set** — it never consults what the component looks like in Figma. Result: an "alert" comes out shaped like a "button," and the fault compounds when index-grounding (Plan B B3) nudges the agent toward existing similar components.

The verify step (`verifyPrompt`) was recently hardened with a compile gate and a no-render→BLOCKED honesty gate, but it still only type-checks and greps; it never renders the component and compares it to the design. And it *could not*, because the reference file lacks per-component frames — its pages are Cover/Typography/Icons, so the Figma MCP had nothing per-component to compare against.

The user is standardizing their Figma files on a **page-per-component** convention: each page is named for one component and contains that component with its variations. That convention is the missing anchor — it gives every component a discoverable, authoritative reference for both building and validating.

## Goals / Non-Goals

**Goals:**
- Restore design fidelity by anchoring the build to each component's Figma reference instead of its name.
- Add a visual → token → code validation gate that compares a real render to the Figma reference and refuses to mark a component "verified" without that evidence.
- Establish and consume the page-per-component convention as the per-component design reference.
- Keep model spend right-sized: cheapest tier that does the job; no expensive self-certifying verify.

**Non-Goals:**
- Pixel-perfect automated diffing / SSIM scoring. Comparison is an AI visual judgment against the reference screenshot, not a numeric image-diff pipeline (can be layered later).
- Re-implementing Figma retrieval — reuse the existing bridge/MCP read path.
- Changing token extraction (the Foundation) — tokens remain the source of truth for values.
- Windows/Linux process concerns (deferred past D4, unchanged here).

## Decisions

**1. Page-per-component is the reference unit.** A Figma page whose name matches a roster component is that component's authoritative reference (component + variant frames). Alternatives considered: (a) node-id per component threaded through config — brittle and manual, and it already failed (the file had no per-component nodes); (b) infer from frame names on a shared canvas — ambiguous. A named page is human-authored, discoverable, and matches how the user already organizes files.

**2. Build carries the reference, not just the name.** `buildOnePrompt`/`buildChunkPrompt` gain the component's reference: variant structure, the tokens each variant uses, and a screenshot (or MCP handle to fetch it). The prompt instruction changes from "implement `<name>` using only tokens" to "reproduce the referenced design for `<name>`, using tokens for values." Tokens still govern values; the reference governs shape/structure/variants. Alternative — keep name-only and fix it purely in verify — rejected: verify can reject bad output but can't make the build produce good output, so we'd loop forever (exactly the user's "done this three or four times").

**3. Validation order is visual → token → code, each reported independently.** Visual first because a component that compiles and uses tokens but looks wrong is still wrong, and that is the regression we are fixing. Each layer yields its own outcome so a visual mismatch is never masked by a green compile. Reuses and extends the existing `verifyPrompt` verdict machinery (PASS/ISSUES/BLOCKED) rather than inventing a parallel one.

**4. Visual pass requires a real render-and-compare.** The gate renders via Storybook (the reference file is Storybook-only), screenshots each variant, and compares to the reference screenshot. No render surface → BLOCKED, never PASS — extending the honesty gate already in place. This is what stops the "it looked like it did it but it didn't" self-certification.

**5. Right-size the model.** Visual compare and token checks route to the cheapest capable tier (Haiku for atoms/molecules, escalate only for genuinely complex organisms), consistent with `tierForChunk` and the cost-optimization memory. No defaulting to Sonnet/Opus for verification.

**6. Reference precedence over index-grounding.** When both an index digest and a component reference are present, the component's own reference wins for that component's shape, so grounding can't homogenize everything toward one existing component.

## Risks / Trade-offs

- **[Figma bridge/MCP flakiness]** → If retrieval fails, block honestly (reference unavailable) rather than proceeding reference-less; surface a fix-it card, don't silently degrade to name-only.
- **[Storybook not running / no preview URL]** → Visual layer returns BLOCKED; the flow must offer to start the render surface. Never convert BLOCKED into PASS.
- **[Author hasn't adopted page-per-component]** → Unmapped components are marked "no reference" and are not falsely reported as design-matching; document the convention so adoption is deliberate.
- **[AI visual judgment is subjective]** → Require the gate to name concrete differences (missing slot, wrong container, absent variants), not a bare verdict, so a human can adjudicate. Numeric diffing can be added later without changing the contract.
- **[Extra Figma reads + renders cost tokens/time]** → Mitigated by right-sized models and by fetching a component's reference once (cache alongside the B2 scan cache), not per attempt.
- **[BREAKING change to build prompts]** → `buildOnePrompt` behavior changes; update `sdd-prompts.test.ts` expectations and keep a name-only fallback path only for the genuinely no-reference case.

## Migration Plan

1. Land the page-per-component discovery + mapping and per-component reference retrieval (capability `figma-component-reference`), cached alongside the existing scan cache.
2. Thread the reference into `buildOnePrompt`/`buildChunkPrompt` (capability `design-anchored-build`); update prompt tests.
3. Extend `verifyPrompt` + the guided-flow status into the ordered visual→token→code gate (capability `visual-validation-gate`); render via Storybook.
4. Update `@royvillasana/sdd-de` methodology docs with the convention; bump and re-wire the package version.
5. Validate end-to-end on the user's TokenUpdate project (69-component roster, Storybook-only): a known-bad component (alert) must now build to match and only reach "verified" after a real visual compare.

Rollback: the reference-threading and gate are additive prompt/flow changes; reverting the prompt edits restores prior behavior without data migration.

## Open Questions

- Screenshot transport: pass the reference image to the agent via the MCP handle it fetches itself, or capture and hand it a local file? Prefer the agent fetching via MCP to avoid a second image pipeline — confirm the render/verify agent has MCP access in the run context.
- Matching a roster name to a page name: exact vs normalized (reuse `normComponentName`)? Lean normalized to tolerate case/separator differences.
- Where the mapping lives: extend `.vortspec/maps/components.json` (Plan B) vs a new file — likely extend, to keep one component map.
