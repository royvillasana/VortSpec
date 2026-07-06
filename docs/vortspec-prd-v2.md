# VortSpec PRD v2.0 (DESKTOP PIVOT)

**Product:** VortSpec, the Spec-Driven Design Engineering desktop app
**Author:** Roy Villasana
**Version:** 2.0 (supersedes PRD 1.x entirely)
**Date:** 2026-07-05
**Companion documents:** CLAUDE-CODE-BRIEF.md requires a v2 rewrite after this PRD is approved. vortspec-ir-schemas.md is retired as a normative document (see section 3).

---

## 1. PIVOT STATEMENT (read first)

VortSpec pivots from a web platform with its own server-side normalization pipeline to a **desktop application (Electron) that wraps the terminal**: a friendly, guided GUI over Claude Code running the SDD-DE workflow locally.

**Why:**
- A web app cannot honestly deliver the core promises: local code generation into the user's real project folder, running their dev environment, and working inside their actual repo. A desktop app can.
- Claude Code already is the agent runtime, with the user's own authentication and plan. Building and billing a server-side LLM layer (BYOK, bundled keys, usage caps) duplicated what the user already has on their machine.
- The SDD-DE CLI already works. The product gap was never the engine; it was that the CLI requires terminal fluency. The highest-value product is the intuitive layer on top of the proven workflow, not a re-implementation of it.

**What VortSpec v2 is:** the desktop cockpit for Spec-Driven Design Engineering. It connects to the user's local Claude Code, guides them through the same steps the SDD-DE CLI prescribes (initial intake questions, design import, spec generation, approval gates, implementation, verification), generates code into a local folder, runs the dev environment, and shows progress in a clear, friendly way.

**What VortSpec v2 is NOT:** a web service, a hosted pipeline, an account system, a replacement for Claude Code, or a new agent runtime.

## 2. What is discarded, what survives

**Discarded (delete from main, see section 12 for the migration plan):**
- The Next.js web app, Supabase schema, RLS, auth, storage
- The Inngest pipeline and the server-side normalization stages
- The server-side LLMProvider abstraction, BYOK key storage, usage metering
- The Figma REST adapter as own code (Claude Code reaches Figma via the Figma MCP)
- The IR schemas as a normative runtime contract (packages/ir)

**Survives:**
- The product name, the category ("the Spec-Driven Design Engineering platform") and the positioning
- The SDD-DE methodology and its skills: they are now the literal engine, driven through Claude Code
- The visual design system and all Claude Design screens: dashboard, pipeline progress stepper, patch/approval cards, chat panel. They map almost 1:1 to the new surfaces
- The product principles: spec-first gates, visible progress, nothing mutates without approval
- The design fixtures and screenshots in `design/`

## 3. Note on the IR schemas document

vortspec-ir-schemas.md stops being normative. In v2, interpretation of designs is Claude Code's job through the SDD-DE skills, and artifacts live as files in the user's project (briefs, specs, tokens, code). The app parses and renders those artifacts; it does not maintain its own canonical IR store. Zod validation survives only at the artifact-parsing boundary (section 8). Keep the document in `docs/archive/` as design history; parts of it may return if a future inspector view needs a stricter token format.

## 4. Problem

Design-to-code with AI works best today through agentic CLI workflows (Claude Code + a disciplined methodology like SDD-DE), but that combination is only accessible to people fluent in terminals, agent orchestration and prompt debugging. Designers and design engineers who would benefit most from spec-driven generation are excluded by the interface, not by the capability.

## 5. Vision

Anyone who can use Figma can run a professional spec-driven design-to-code workflow. VortSpec makes the terminal invisible without hiding what the agent does: every step of the SDD-DE cycle becomes a screen with clear status, every artifact becomes a readable, approvable document, and the output is real code in the user's real project, running in their real dev environment.

## 6. Product principles

1. **Claude Code is the engine; VortSpec is the cockpit.** The app never re-implements agent logic. It configures, launches, observes and gates Claude Code runs.
2. **Same steps as the CLI.** The guided flow follows the SDD-DE cycle exactly. VortSpec adds usability, never a divergent methodology. If the CLI and the app disagree, the CLI's methodology wins.
3. **Spec-first gates.** Generated artifacts (briefs, specs, plans) require explicit user approval before implementation proceeds. The app enforces the gates the CLI could only recommend.
4. **Local-first, transparent.** Everything lives in the user's project folder as plain files. The embedded terminal view is always one click away; the friendly UI is a lens, not a cage.
5. **The user's own Claude.** Authentication, plan and usage belong to the user's Claude Code installation. VortSpec stores no provider keys and proxies no model traffic.

## 7. Architecture

```
Electron app
├── Main process (Node)
│   ├── Environment manager: detect Node, git, Claude Code install + login state
│   ├── Workspace manager: project folder selection, SDD-DE toolkit install/update
│   ├── Agent runner: spawns Claude Code headless
│   │     (claude -p ... --output-format stream-json) per step,
│   │     parses the event stream into typed run events
│   ├── PTY service (node-pty): real terminal sessions for the
│   │     transparency view and for the dev server
│   └── File watcher: artifact changes in the project folder
├── Renderer (React + Tailwind, VortSpec design system)
│   ├── Onboarding & environment check
│   ├── Project dashboard
│   ├── Guided SDD flow (stepper: the CLI's steps as stages)
│   ├── Intake forms (the CLI's initial questions as a friendly questionnaire)
│   ├── Artifact review (briefs/specs rendered with approve/request-changes)
│   ├── Run view (live agent progress, tool events, embedded terminal toggle)
│   ├── Dev preview (embedded webview of the local dev server)
│   ├── Design System Inspector (tokens + components browser and a live
│   │     component playground/validator, all over the project's own files)
│   └── History (runs, artifacts, decisions)
└── IPC: typed contracts between main and renderer (zod-validated)
```

**Claude Code integration strategy:** primary mode is headless runs with structured JSON streaming, which gives the renderer typed events (assistant text, tool calls, file edits, completion) to render friendly progress. The embedded PTY terminal exists for transparency and as a fallback for interactive moments. Exact flags and event shapes must be verified against current Claude Code docs at implementation time and isolated behind an adapter, since the CLI's interface evolves.

## 8. Functional requirements

### 8.1 Onboarding & environment check
- **US-01:** On first launch, VortSpec checks the environment: Node version, git, Claude Code installed, Claude Code logged in. Each check renders as a row with pass/fail and a fix action (install link, "open login" which runs the login flow in the embedded terminal).
- **US-02:** The user selects or creates a project folder. If the SDD-DE toolkit is not present in the project, VortSpec installs or updates it (same mechanism as the CLI's init) and reports the installed version.
- AC: no VortSpec account, no telemetry without opt-in, no provider keys ever requested or stored.

### 8.2 Project dashboard
- **US-03:** A dashboard lists known projects with: name, path, SDD-DE toolkit version, last run status, and quick actions (open flow, open folder, open terminal). Visual language reuses the v1 dashboard design.

### 8.3 Design input
- **US-04:** The user provides the design source exactly as the CLI supports: a Figma link (via the user's configured Figma MCP in Claude Code), a ZIP export (Google Stitch, Claude Design or generic HTML/CSS) dropped into the app which places it in the project's expected input path, or an existing folder/repo.
- AC: MCP configuration problems (Figma MCP missing/unauthenticated) are detected from the run events and rendered as a fix-it card, not a raw error.

### 8.4 Guided SDD flow (the core surface)
- **US-05:** The flow renders the SDD-DE cycle as a stepper. Each stage card shows: status (pending, running, needs review, approved, failed), a summary of what the stage does, and its artifacts.
- **US-06 (intake):** The CLI's initial discovery questions (the CTO-style intake) render as a friendly form/wizard. Answers are written to the project in the format the skills expect, then the corresponding Claude Code step runs.
- **US-07 (artifact gates):** When a stage produces an artifact (enriched brief, spec, plan), the flow pauses in "needs review". The artifact renders as a formatted document with two actions: Approve (advances the flow) and Request changes (a text box whose content is fed back to the agent for revision). Nothing advances without approval.
- **US-08 (implementation):** The implementation stage streams progress: current task, files being created/edited (with paths), tool activity, and a friendly log. A toggle reveals the raw terminal. Cancel is always available and kills the child process cleanly.
- **US-09 (verification):** The CLI's verification steps (visual-verify, adversarial review) render their outputs as review cards: findings listed with severity, each approvable or sent back, reusing the v1 issues/patch-card visual language.

### 8.5 Dev preview
- **US-10:** After implementation, VortSpec offers to run the project's dev environment (detected from package.json scripts). The server runs in a managed PTY; its URL renders in an embedded preview panel with an "open in browser" escape hatch. Server logs are available in the terminal view.

### 8.6 History
- **US-11:** Every run is recorded locally (stage, timestamps, artifacts produced, approval decisions, outcome) and browsable as a timeline reusing the v1 history design. Storage is plain files inside the project (e.g. `.vortspec/runs/`), git-ignorable by user choice.

### 8.7 Design System Inspector & Playground

Once the flow has produced tokens and components, VortSpec offers an **Inspector** to browse and validate the whole design system in-app, adopting the visual language of the `vortspec-design-inspector/` design bundle re-based onto v2's file model (no IR store; everything is derived from the project's files).

- **US-12 (tokens & components browser):** The Inspector shows every design token (parsed from the project `token_file`, and the authoritative Figma variables when the Desktop Bridge is connected) grouped by type with swatches, resolved mono values, a file-derived source badge (figma-variable / from-code / hand-edited), search/filter, and a "where used" cross-reference; and every component (from `.sdd-de/components.json` + generated source) with its variants, states, props, consumed tokens, and links to its spec and visual-verify report.
- **US-13 (playground / render harness):** A Storybook-like Playground renders the **real** generated components live across variants/states by launching the project's browsable surface in a managed PTY and embedding it (reusing the Dev preview, §8.5). When no browsable surface exists — the current visual-verify blocker — VortSpec offers to have Claude Code generate a framework-correct harness (gallery route or stories); VortSpec writes no renderer code itself. This doubles as the render harness the visual-verify step needs.
- **US-14 (validate & gated-modify):** The Inspector surfaces issues from the visual-verify / adversarial-review reports and lets the user request fixes. Every modification is gated: token value edits are written to the token file on explicit confirm; component/code changes route through Claude Code and are applied only after the user approves the diff. Nothing mutates silently.
- AC: no IR store or normalization pipeline; everything derived from project files; spec-first gates before any mutation; the raw file/terminal is always one click away; works regardless of the project's framework.

## 9. Non-functional requirements

- **Platforms:** macOS first (the founder's environment and the majority of the early audience), Windows and Linux after D3. node-pty and process handling are the main portability risks; isolate them.
- **Security:** child processes only ever run in the selected project folder; no shell string interpolation of user input (spawn with arg arrays); no network calls from VortSpec itself except update checks (opt-in). All model traffic belongs to Claude Code.
- **Resilience:** a crashed or hung agent run must be cancelable and must not corrupt flow state; state is derived from files on disk plus the run log, so the app can always be closed and reopened mid-flow.
- **Transparency:** every friendly view has a path to the underlying raw form (terminal, file on disk).

## 10. Stack

- Electron + electron-vite, React, TypeScript strict, Tailwind, the VortSpec design tokens from v1
- node-pty + xterm.js for terminal sessions
- Claude Code headless with JSON streaming behind an `AgentAdapter` interface (single place that knows CLI flags and event shapes)
- zod at the boundaries: IPC contracts, run-event parsing, artifact frontmatter parsing
- Vitest for main-process units; Playwright for renderer flows; fixture transcripts of recorded Claude Code streams for deterministic run-view tests
- electron-builder for packaging; code signing deferred to D4

## 11. Milestones

- **D0, Skeleton:** Electron app boots, environment check screen real (detects Node/git/Claude Code/login), project folder selection, SDD-DE toolkit install. *Done when: a fresh machine reaches a ready project in under 5 minutes.*
- **D1, First wrapped run:** AgentAdapter runs one real SDD-DE step headless against a project, stream parsed, run view renders live progress, embedded terminal toggle works, cancel works. *Done when: the intake + enrich-brief step completes end to end from the UI.*
- **D2, Full guided flow:** the complete SDD-DE cycle as the stepper with intake forms and artifact approval gates. *Done when: ZIP design in, approved specs, generated component code in the local folder, entirely through the UI.*
- **D3, Dev preview + history:** managed dev server with embedded preview; run history timeline. *Done when: the generated component is visible running locally inside the app.*
- **D3.5, Design System Inspector & Playground (§8.7):** in-app tokens + components browser over project files, and a live component playground that reuses the managed dev-server/webview (and generates a harness via Claude Code when none exists, closing the visual-verify render gap); gated validate-and-modify loop. *Done when: on a real generated project, the user can browse every token and component and render a component live in the app, and a requested fix lands through the spec-first gate.*
- **D4, Distribution:** packaged builds for macOS, auto-update, onboarding polish. Windows/Linux builds begin here.

## 12. Migration and deletion plan (for Claude Code, execute at D0 start)

1. Tag the current main as `archive/web-app-v1` and push the tag. This preserves M0/M1 work permanently without keeping it in the working tree.
2. Delete from main: `apps/web`, `packages/pipeline`, `packages/ir`, `supabase/`, Inngest config, and all web-app environment files.
3. Keep: `design/` (screens, export ZIP, design tokens), `docs/` with this PRD as the primary document, `docs/archive/` containing PRD v1 and vortspec-ir-schemas.md marked as superseded.
4. Re-scaffold the repo as the Electron app per section 10. The monorepo may simplify to a single package until a second package earns its existence.
5. Update CLAUDE.md (the working agreement) to v2: same invariant spirit (gates, approvals, no silent mutation), new scope.

## 13. Risks and open questions

- **Terms and identification (verify before D1):** wrapping Claude Code means the user's plan/credit rules apply to usage initiated by a third-party tool. Verify current Anthropic policy and the correct way for a wrapper to identify itself, in the official docs, before shipping anything public. This is the project's existential dependency; treat it as a launch gate.
- **CLI interface drift:** Claude Code flags and stream formats evolve. Mitigation: the AgentAdapter, recorded-transcript fixtures, and a version check with a compatibility notice in the UI.
- **Interactive moments in headless mode:** some steps may require interaction that streaming mode does not surface cleanly; the PTY fallback exists for this, but the seams must be designed, not improvised.
- **Windows:** node-pty, path handling and process signals are the classic pain; defer, do not ignore.
- **Scope temptation:** the v1 Inspector was compelling. Real usage has now asked for it, so the tokens/components browser and the component playground are committed as **§8.7 / D3.5** — but strictly as *viewers and gated validators over the project's files*, never a revived IR/normalization store. The remaining v1 surfaces (Graph, Assistant, Issues, History-as-timeline beyond §8.6) stay deferred: they return only as file-derived viewers, after D4, and only if usage asks.
