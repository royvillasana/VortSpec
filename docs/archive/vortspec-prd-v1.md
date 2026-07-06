# VortSpec PRD

**Product:** VortSpec, the Spec-Driven Design Engineering platform
**Author:** Roy Villasana
**Version:** 1.0
**Date:** 2026-07-04
**Build scope of this PRD:** Phase 1 (Ingestion + Normalization + Design Inspector). Later phases are documented for architectural context but are explicitly out of scope for the initial build.
**Companion documents:** `vortspec-ir-schemas.md` (normative), `CLAUDE-CODE-BRIEF.md` (working agreement)

---

## 1. Problem

Design-to-code today is either manual translation (slow, inconsistent, loses design-system fidelity) or generic AI generation (fast, but produces code disconnected from the team's tokens, variants and conventions). Teams using AI design tools (Google Stitch, Claude Design, v0, Lovable) receive exports full of untokenized values, duplicated styles and implicit structure that never survive contact with a real codebase.

The methodology to fix this already exists: Spec-Driven Design Engineering (SDD-E), proven as a CLI (SDD-DE) that guides coding agents through a spec-first cycle. But the CLI requires terminal fluency, agent orchestration knowledge, and manual multi-source wrangling. The methodology works; the delivery mechanism limits who can use it.

## 2. Vision

VortSpec is a web platform where design, from any source, is elevated to a canonical, validated, token-referenced representation, and from there converted into production components and screens through a spec-first agentic pipeline.

Full product arc (phases 1-6): ingest designs from anywhere -> normalize into a canonical IR -> let the user audit and validate the design system in a Figma-grade inspector -> run the SDD pipeline to produce validated coded components -> compose screens on a canvas restricted to validated components -> export production code via PR.

**Product thesis:** the unit of trust is the validated component. Everything upstream exists to produce it; everything downstream is only allowed to consume it.

## 3. Product principles

1. **The IR is the truth.** All sources converge into one canonical format (see schemas doc). No module ever reads a raw source directly except adapters.
2. **The standard is Figma-grade semantics.** Tokens, variants, typed props, auto-layout, states. Poor sources get enriched up to the standard, with provenance tracking every inference.
3. **Spec-first gates.** Nothing advances without explicit approval: inferences are proposals, LLM edits are diffs awaiting approval, components must be approved before screens can use them.
4. **Deterministic core, LLM judgment.** Parsing, mining, matching, codegen: deterministic and testable. Naming, grouping, ambiguity resolution, conversational edits: LLM, always behind the IRPatch approval contract.
5. **AI-agnostic.** All LLM calls go through an `LLMProvider` interface. Anthropic is the default implementation. BYOK and bundled-AI are both first-class.
6. **Tokens by reference, always.** The invariant that makes theming, usage tracking and consistency possible.

## 4. Users

- **Primary: Design Engineers / UX Engineers.** Own the design-system-to-code boundary. Judge the product on IR fidelity and code quality. Comfortable with technical concepts, tired of glue work.
- **Secondary: Product Designers who ship.** Use AI design tools, want their output to become real components without begging engineering. Judge the product on the Inspector UX.
- **Tertiary: Frontend developers.** Receive the output. Judge the product on whether generated components read like code a senior colleague wrote.

Locale note: UI copy in English for v1; architecture must not block adding Spanish (all user-facing strings through an i18n layer from day one).

## 5. Product architecture (full map, phases annotated)

```
Frontend (Next.js)
├── Onboarding & Projects .................. Phase 1
├── Import flow (ZIP upload, Figma connect)  Phase 1
├── Design Inspector ....................... Phase 1
│   ├── Tokens & styles panel
│   ├── Components panel
│   ├── Graph view (token wiring canvas, React Flow)
│   ├── Issues / review queue
│   └── Conversational editing (chat + diff approval)
├── Component Factory UI ................... Phase 2
├── Screen Builder (canvas + chat) ......... Phase 3
└── Export / PR flow ....................... Phase 2-3

Backend
├── Adapters
│   ├── zip-html (generic: Stitch, Claude Design, HTML/CSS exports)  Phase 1
│   ├── figma-rest ......................... Phase 1
│   ├── stitch-mcp ......................... Phase 4
│   └── native library ..................... Phase 5
├── Normalization pipeline ................. Phase 1
├── IR store (versioned, patch-based) ...... Phase 1
├── LLMProvider (Anthropic default, BYOK) .. Phase 1
├── Agent runtime (SDD pipeline) ........... Phase 2
├── Codegen (IR -> React/CVA, deterministic) Phase 2
├── Execution sandbox (visual-verify) ...... Phase 2
├── Screen IR + canvas protocol ............ Phase 3
└── Integrations: GitHub App, Jira ......... Phase 2-4
```

## 6. Phase 1 scope statement

**Build:** a user can create a project, import designs via ZIP upload or Figma connection, watch the normalization pipeline run with visible progress, then audit the result in the Design Inspector: browse tokens with provenance and usage, browse components with variants and completeness scores, explore and rewire token bindings in the graph view, fix issues via direct edits or chat commands with diff approval, and mark components as approved.

**Explicitly NOT in phase 1:** code generation, execution sandbox, visual-verify, Component Factory pipeline, Screen Builder composition canvas (the token wiring graph of 7.6 IS in scope; free-form screen composition is not), Jira, GitHub write operations, Stitch MCP, native library, multi-user collaboration, billing.

**Phase 1 exit criterion:** a real Stitch ZIP export and a real Figma file can each be imported, normalized and fully audited, ending with at least one component reaching `approved` status, entirely through the UI.

## 7. Functional requirements, Phase 1

### 7.1 Projects & onboarding

- **US-01:** As a user, I can sign up / sign in (email magic link + Google OAuth via Supabase Auth).
- **US-02:** As a user, I can create a project with a name. A project owns its tokens, components, imports and patches. All data is project-scoped.
- **Onboarding principle:** account + project name is the only mandatory setup. Every external connection (Figma now; Jira and GitHub in later phases) is optional, requested at the point of need, and never blocks onboarding or the core flow. A user who connects nothing can still use the full ZIP import path.
- **US-03:** As a user, I can configure my AI provider per project: bundled (default, uses platform key with usage caps) or BYOK (paste Anthropic/OpenAI key). Keys are encrypted at rest (Supabase Vault or KMS-equivalent) and never returned to the client after save; only a masked fingerprint is shown.
  - AC: attempting any LLM-dependent action with an invalid/missing key produces a clear, actionable error, not a silent failure.

### 7.2 Ingestion: ZIP adapter (build first)

- **US-04:** As a user, I can upload a ZIP (drag-and-drop, up to 50 MB) containing an HTML/CSS export (Google Stitch, Claude Design, or generic HTML+CSS).
  - AC: rejected with a friendly error if no parseable HTML/CSS is found.
  - AC: uploaded file stored in Supabase Storage; import job created and queued.
- **US-05:** As a user, I see the import progress live, broken into pipeline stages (see 7.4), with per-stage status: queued, running, done, failed. Failures show a human-readable reason and allow retry of the failed stage.
- **US-06:** As a user, I can optionally attach a companion design system to an import: a tokens JSON (W3C design tokens or Style Dictionary format), a CSS custom-properties file, or a second ZIP. The pipeline uses it as the official token source for matching (stage 5).

### 7.3 Ingestion: Figma adapter

- **US-07:** As a user, I can connect Figma via OAuth and pick a file (or paste a file URL) to import.
- **US-08:** The adapter reads via Figma REST API: published components and component sets (variants), variables/styles where available on the user's plan, auto-layout properties, and text styles. Everything maps to the IR with `confidence: 'confirmed'` where Figma semantics are explicit, `'inferred'` where the adapter had to guess.
  - AC: a component set with variant properties becomes one ComponentIR with correct `variantAxes`, not N separate components.
  - AC: Figma variables become tokens with `confidence: 'confirmed'`; raw fills/effects not bound to variables become mined candidates like in the ZIP flow.
  - AC: rate limiting and pagination handled; a 200-component file imports without manual intervention.

### 7.4 Normalization pipeline

Runs as a background job with six ordered stages. Each stage is a pure function over the IR draft plus stage-specific inputs, independently testable with fixtures.

1. **Parse.** Extract HTML/CSS/assets from ZIP, or fetch node tree from Figma. Output: raw source model.
2. **Style mining (deterministic).** Collect every literal style value; group exact duplicates; compute usage counts.
3. **Token inference.** Promote candidate groups to tokens (`inferred`). LLM names and role-groups candidates (batch call, structured output validated by Zod). Near-duplicates produce merge suggestions as issues.
4. **Structure inference.** Detect repeated DOM/node patterns as components; infer variant axes from systematic differences; infer states from pseudo-classes (`:hover`, `:disabled`) or Figma interaction states; map layout to the LayoutSpec model; bind text nodes to prop candidates.
5. **DS merge.** If a companion DS was attached: match mined tokens to official ones (exact value, then near-value); rewrite refs to official tokens on exact match; emit `token-conflict` issues on mismatches. Never silently override.
6. **Report.** Compute CompletenessReport per component and a project-level summary. Set components to `normalized`.

- AC: pipeline is resumable per stage; a stage-4 failure does not re-run stages 1-3.
- AC: every LLM call in stages 3-4 logs prompt hash, model, token usage, and validates output against Zod with one retry.
- AC: the same ZIP imported twice produces identical IR (deterministic stages) except LLM naming, which must be stable given identical input (temperature 0).

### 7.5 Design Inspector

The core surface of phase 1. Layout: left rail (Tokens / Components / Issues), main panel, right-side chat drawer.

**Tokens panel**

- **US-09:** I see token collections grouped by type (color, typography, spacing, radius, shadow, other), each with a visual preview, name, resolved value, provenance badge (confirmed / inferred / pending, with source icon), and usage count.
- **US-10:** Clicking a token opens a detail view: full value editor, alias controls, and "where used" listing every component/node/property, with hover-highlight on the component preview.
- **US-11:** I can rename a token (live preview of all usages), edit its value, create an alias, merge N tokens into one (with a preview of every ref that will be rewritten), delete a token (choosing fallback: inline as flagged literal, or remap to another token), and promote a flagged literal to a new token from any usage site.
  - AC: every one of these actions is executed as an IRPatch and appears in project history with undo.

**Components panel**

- **US-12:** I see all components as cards: name, static preview (rendered from IR, see note below), variant count, completeness score with color coding, status chip.
- **US-13:** Component detail view opens with a **Playground** at the top: a live preview of the component rendered from the IR, with controls generated from its metadata (one control per prop using its ControlHint, a segmented control per variant axis, a toggle per interaction state) and an inline token list showing the tokens this component consumes; editing a token value here propagates to every preview on the page. Below the preview, a **CHECKS row** computed from the IR: variant render coverage ("Renders 9/9"), text contrast ratio against WCAG AA, hit target size, and focus state presence. Checks are pure functions over the IR and feed the CompletenessReport; failed checks link to their issue. Below the Playground: variant matrix (grid of variant combinations rendered from IR), props table, states list, structure tree, and issues. Inferred items show their badge and a one-click confirm.
  - AC: Playground state (variant selection, prop values, token edits) is client-side and ephemeral except token edits, which are offered as an IRPatch ("Apply as change") rather than mutating silently.
  - AC: this is the Storybook-grade experience without Storybook; no sandbox, no user code execution, no iframe of arbitrary output. Everything renders through the internal IR renderer.
- **US-14:** I can rename components, rename/confirm/edit variant axes and options, edit prop definitions, and discard components (junk detection false positives).
- **US-15:** I can mark a component `approved`. Approval requires zero `error`-severity issues; warnings prompt a confirmation dialog listing them.

*Preview rendering note:* phase 1 previews are generated by an internal IR renderer (`packages/renderer`: IR + variant selection + prop values -> HTML/CSS, runnable server-side for card thumbnails and client-side for the interactive Playground). It renders ONLY from the IR: it is NOT the codegen module (phase 2), it executes no user code, and it needs no sandbox. Interactivity in the Playground means re-rendering with different inputs, not running component code. Scope its CSS fidelity to what the LayoutSpec and StyleProperty models express; anything beyond that is phase 2.

**Issues panel**

- **US-16:** Project-wide issue list from all CompletenessReports, filterable by severity/kind/component, each with a deep link to its target and, where available, the one-click `suggestedAction` patch.

**Conversational editing**

- **US-17:** In the chat drawer I can write commands in English or Spanish: "rename all color tokens to the semantic/primary/500 format", "merge the three greys between #6B7280 and #71717A", "set radius to 8px on all form components", "delete unused tokens".
- **US-18:** The LLM responds with a proposed IRPatch rendered as a visual diff (per-op before/after, affected counts). I approve or reject. Nothing mutates without approval.
  - AC: follows the conversational editing contract in the schemas doc (Zod validation, one retry, atomic apply, optimistic concurrency on `baseVersion`).
  - AC: ambiguous commands produce a clarifying question, not a guessed patch.

### 7.6 Graph view (token wiring canvas)

An alternative Inspector lens that renders the IR as an editable node graph (React Flow). It makes the core invariant ("every style value is a token reference") literally visible and manipulable as wiring. This is an inspection and rewiring surface over existing IR; it does NOT create components or compose screens (that is the phase 3 canvas).

- **US-20 (component lens):** As a user, I open the Graph tab and see the graph for a selected component: the component as a central node rendering its live preview via the IR renderer (with the variant selector available on the node), input handles on its left edge grouped by bound property (background, text color, radius, typography, gap), one handle per (nodePath, property) binding; token nodes arranged to the left, one per consumed token, each with type swatch, mono name, resolved value and provenance dot; edges connecting token outputs to property handles, colored by token type.
  - AC: the graph is a pure projection of the IR, derived from style refs / TokenUsage. There is no separately persisted graph model. Positions come from auto-layout (elkjs); manual repositioning is session-ephemeral in phase 1.
- **US-21 (rewiring):** Dragging an edge end from one token to another token node updates the binding, executed as a `component.updateNode` IRPatch, applied immediately with undo, and the component preview re-renders live.
  - AC: only type-compatible connections are accepted (color to color, radius to radius); an incompatible drop is rejected with a shake animation and a tooltip ("radius/md is not a color"), never a silent cast. Compatible targets highlight while dragging.
- **US-22 (disconnect to literal):** Deleting an edge converts the binding into a flagged literal carrying the last resolved value (invariant 1), rendered as a small amber literal chip attached to the handle with a "Promote to token" action, and creates the corresponding flagged-literal issue. Existing flagged literals from import appear the same way.
- **US-23 (token lens):** Clicking a token node pivots the graph: that token centered, edges fanning out to every component that consumes it (components as preview thumbnails with name and completeness chip). Editing the token value in its side panel re-renders every connected thumbnail and briefly highlights the affected edges. Token edits here follow the same patch semantics as US-11.
- AC (both lenses): every mutation appears in History with the standard patch card and undo; performance target is a smooth graph at 60fps with 50 token nodes and 12 component thumbnails.

### 7.7 History & versioning

- **US-19:** I can see the project's patch history (summary, author user/llm, timestamp) and undo the most recent applied patches in reverse order (linear undo is sufficient for phase 1).

## 8. Non-functional requirements

- **Performance:** import of a 200-component Figma file or 20 MB ZIP completes in under 5 minutes; Inspector interactions under 200 ms perceived; previews lazy-loaded.
- **Security:** BYOK keys encrypted at rest, never logged, never sent to the client; all storage and DB access scoped by project via RLS; uploaded ZIPs virus-scanned or size/type-restricted and processed in an isolated worker, never executed.
- **Reliability:** pipeline jobs idempotent and resumable; LLM failures degrade gracefully (deterministic stages still complete, inference marked pending).
- **Observability:** structured logs per pipeline stage; LLM usage metering per project (needed later for billing, needed now for BYOK cap enforcement).
- **Cost control:** bundled-AI projects have a configurable monthly token cap; hitting it pauses LLM features with a clear message, deterministic features keep working.

## 9. Recommended stack

Chosen for fit with the founder's existing fluency (React, TypeScript, Supabase, Stripe) and solo-maintainability. Claude Code may propose substitutions with justification, except where marked fixed.

- **Monorepo:** pnpm workspaces + Turborepo. Packages: `apps/web`, `packages/ir` (Zod schemas, fixed), `packages/adapters`, `packages/pipeline`, `packages/llm`, `packages/renderer`.
- **Web:** Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui. Graph view: `@xyflow/react` (React Flow) with `elkjs` for auto-layout.
- **Data/Auth/Storage:** Supabase (Postgres + RLS, Auth, Storage, Vault for key encryption).
- **Jobs:** Inngest (or Trigger.dev) for the pipeline: staged, resumable, observable. Do not build a custom queue.
- **LLM:** `packages/llm` exposes `LLMProvider` (complete + structured-output methods). Implementations: Anthropic (default), OpenAI (BYOK parity). Structured outputs always validated with the Zod schemas from `packages/ir`.
- **Testing:** Vitest; golden-fixture tests for every pipeline stage (real Stitch export + real Figma API response captures as fixtures); Playwright for the three critical UI flows (import, token merge, chat patch approval).

## 10. Data model (Postgres, simplified)

```
users (Supabase managed)
projects            id, owner_id, name, ai_mode, created_at
project_ai_keys     id, project_id, provider, encrypted_key, fingerprint
sources             id, project_id, kind, storage_ref | figma_file_key, created_at
imports             id, project_id, source_id, status, stage_states jsonb, error, created_at
tokens              id, project_id, doc jsonb (DesignToken), deprecated, updated_at
components          id, project_id, doc jsonb (ComponentIR), status, version, updated_at
patches             id, project_id, doc jsonb (IRPatch), status, base_version, created_at
token_usage         (materialized/computed view or table refreshed on patch apply)
llm_usage           id, project_id, provider, model, tokens_in, tokens_out, purpose, created_at
```

JSONB-document storage with Zod validation at the boundary is deliberate: the IR evolves fast in early phases; relational extraction (e.g. proper token columns) is a phase 2+ optimization once shapes stabilize.

## 11. Milestones

- **M0, Foundation:** monorepo, Supabase project, auth, projects CRUD, `packages/ir` with all Zod schemas + fixtures + tests. *Done when: schemas validate the example Button from the schemas doc.*
- **M1, ZIP ingest + pipeline (deterministic):** upload flow, job runner, stages 1-2 and 4 (structure without LLM naming) + 6, progress UI. *Done when: a real Stitch export ZIP produces browsable `normalized` components with mined token candidates.*
- **M2, LLM layer:** `LLMProvider`, BYOK storage, stage 3 (token naming/grouping) and stage-4 LLM assists, usage metering, caps. *Done when: the same import now yields semantically named tokens, all marked inferred.*
- **M3, Design Inspector:** tokens panel, components panel with Playground (metadata-driven controls + IR-computed checks), issues panel, all direct-edit operations as patches, history + undo, previews via the IR renderer. *Done when: a user can take an import to one `approved` component without touching the chat, exercising the Playground controls along the way.*
- **M4, Conversational editing + Figma adapter:** chat drawer with diff approval; figma-rest adapter end to end. *Done when: the phase 1 exit criterion passes for both source types.*
- **M5, Graph view:** component lens with live preview node, token nodes, type-safe edge rewiring as patches, disconnect-to-literal, token lens. *Done when: rewiring Button's background from color/primary/500 to color/primary/600 updates the preview live and appears in History as an undoable patch.*

Order within milestones is fixed; Claude Code proposes task breakdowns per milestone before implementing.

## 12. Success metrics (phase 1, qualitative + instrumentable)

- Time from ZIP upload to first approved component (target: under 30 minutes for a 10-component export).
- % of style values tokenized after normalization, before any manual fixes (target: 70%+ on Stitch exports).
- % of LLM-proposed patches approved without modification (proxy for inference quality).
- Zero incidents of unapproved mutation (hard invariant, monitored, not targeted).

## 13. Risks

- **Inference quality on messy HTML** (highest product risk): mitigate with golden fixtures from real exports and the pending/confirm UX so wrong guesses cost one click, not trust.
- **Figma API plan limitations** (variables endpoint availability varies): adapter must degrade to style/fill mining when variables are unavailable, and say so in the UI.
- **Scope creep toward phase 2:** the IR renderer is the biggest temptation. The line is now explicit: it renders from the IR with different inputs (Playground), it never executes component code, never embeds arbitrary output, and never grows CSS features beyond the LayoutSpec/StyleProperty models.
- **Solo-founder bandwidth:** every milestone leaves the product in a demoable state on purpose.

## 14. Open questions (decide before M2)

1. Bundled-AI pricing/caps for beta (suggest: generous fixed cap, no billing in phase 1).
2. W3C design tokens JSON as the canonical import AND future export format? (Recommendation: yes; keeps VortSpec interoperable with Style Dictionary/Tokens Studio.)
3. Figma OAuth app review timeline; fallback for beta is personal access token input, gated to the founder's own testing.

## 15. Later phases, one paragraph each (context, not scope)

- **Phase 2, Component Factory:** SDD agentic pipeline (spec -> implement -> visual-verify -> adversarial-review) in an execution sandbox (E2B/Fly Machines); deterministic codegen IR -> React + CVA + Tailwind; GitHub App for PR export; approved components become `validated` with code artifacts and Storybook stories.
- **Phase 3, Screen Builder:** Screen IR, live canvas rendering validated components via sandbox dev server, property panel generated from component metadata, mixed direct-manipulation + conversational editing over the same tree, deterministic screen codegen.
- **Phase 4, Connected sources + Jira:** Stitch MCP adapter, Figma frame-to-library matching for screen import, Jira stories as pipeline entry points with status sync. Jira is an optional connection: users who never connect it get the identical core experience, with briefs entered manually instead of pulled from stories.
- **Phase 5, Native design:** built-in themeable base library (shadcn/Radix foundation), theme configurator (the Inspector in creation mode), components born native enter the same Factory.
- **Phase 6, Collaboration:** multiplayer, comments, write-back bridges.
