## Why

VortSpec v1 was a Next.js web platform that re-implemented a design→code normalization pipeline server-side (a canonical IR, a Supabase store, an Inngest pipeline, a server-side LLM provider with BYOK/usage metering, and a Figma REST adapter). PRD v2 pivots entirely because a web app cannot honestly deliver VortSpec's core promise: generating real code into the user's real project folder and running their real dev environment. Meanwhile Claude Code already **is** the agent runtime, with the user's own authentication and plan — so the server-side LLM layer duplicated what the user already has on their machine. The methodology (Spec-Driven Design Engineering) and the visual design system were never the gap; terminal fluency was. VortSpec v2 becomes the **desktop cockpit** over the user's local Claude Code: a friendly, guided GUI that drives the proven SDD-DE workflow without hiding what the agent does.

## What Changes

- **BREAKING — full teardown of the v1 web platform.** Delete `apps/web` (Next.js), all `packages/*` (`ir`, `pipeline`, `llm`, `adapters`, `codegen`), `supabase/`, all Inngest usage, and web-app env files. The repo simplifies to a single Electron app until a second package earns its existence.
- **Preserve v1 as a git tag** `archive/web-app-v1` before deletion; extract the design system (`apps/web/src/app/globals.css` tokens + animations, `components.json`) and create `docs/` (PRD v2 primary, PRD v1 + IR-schemas archived as superseded).
- **Build the Electron desktop app** (electron-vite, React, TypeScript strict, Tailwind + v1 design tokens): a main process that detects the environment, manages the workspace, runs Claude Code headless and parses its event stream, hosts PTY sessions, and watches artifact files; and a React renderer implementing the guided SDD flow.
- **The app is a cockpit, never a re-implementation.** It configures, launches, observes and gates Claude Code runs. Same steps as the CLI; the app adds usability and enforces the spec-first gates the CLI could only recommend.
- **No accounts, no telemetry without opt-in, no provider keys ever.** All model traffic belongs to the user's Claude Code.
- The 9 existing v1 web-app capabilities are **removed/superseded**; their visual language (`projects-dashboard`, patch/issue cards) is reused inside the new desktop surfaces.

## Capabilities

### New Capabilities
- `environment-check`: First-launch detection of Node, git, Claude Code install, and Claude Code login state, each rendered as a pass/fail row with a fix action (install link, embedded-terminal login).
- `workspace-toolkit`: Project folder selection/creation and SDD-DE toolkit install/update into the project, reporting the installed version.
- `design-input`: Accepting design sources exactly as the CLI supports — Figma link (via the user's Figma MCP), dropped ZIP export (Stitch/Claude Design/generic HTML-CSS) placed at the expected input path, or an existing folder/repo — with MCP-misconfiguration surfaced as a fix-it card.
- `guided-sdd-flow`: The SDD-DE cycle rendered as a stepper of stage cards, each showing status (pending/running/needs-review/approved/failed), a summary, and its artifacts.
- `intake-forms`: The CLI's initial discovery (CTO-style intake) rendered as a friendly wizard whose answers are written to the project in the format the skills expect.
- `artifact-gates`: When a stage produces an artifact (enriched brief, spec, plan), the flow pauses in "needs review"; the artifact renders as a formatted document with Approve and Request-changes (fed back to the agent). Nothing advances without approval.
- `agent-runner`: The `AgentAdapter` boundary that spawns Claude Code headless (`claude -p … --output-format stream-json`) per step, parses the event stream into typed run events, and owns all knowledge of CLI flags and event shapes.
- `run-view`: Live rendering of a run — current task, files created/edited with paths, tool activity, friendly log — with a toggle to the raw embedded terminal and an always-available clean cancel.
- `dev-preview`: Running the project's detected dev environment in a managed PTY and rendering its URL in an embedded preview panel with an open-in-browser escape hatch.
- `run-history`: Recording every run locally as plain files (`.vortspec/runs/`) — stages, timestamps, artifacts, approval decisions, outcome — browsable as a timeline.
- `first-run-automation`: A one-click guided setup after install that automates opening a terminal, authenticating Claude Code via the browser, and installing the Figma MCP if absent — resumable and idempotent (skips already-complete steps).

### Modified Capabilities
<!-- These existing web-app capabilities are being REMOVED/superseded by the pivot; their delta specs mark them removed. -->
- `app-shell`: **REMOVED** — the web inspector shell is replaced by the Electron app shell (folded into the new desktop capabilities).
- `import-flow`: **REMOVED** — superseded by `design-input` (local, MCP/ZIP/folder-based).
- `projects-dashboard`: **REMOVED** — superseded by the desktop project dashboard (visual language reused).
- `inspector-tokens`: **REMOVED** — the v1 token inspector is out of scope for v2 (may return post-D4 as an artifact viewer).
- `inspector-components`: **REMOVED** — component factory logic is now Claude Code's job.
- `inspector-graph`: **REMOVED** — the React Flow token/component graph is out of scope for v2.
- `inspector-issues`: **REMOVED** — superseded by verification review cards inside `guided-sdd-flow`/`run-view`.
- `inspector-history`: **REMOVED** — superseded by `run-history`.
- `inspector-assistant`: **REMOVED** — superseded by `artifact-gates` request-changes + the embedded terminal.

## Impact

- **Deleted:** `apps/web`, `packages/{ir,pipeline,llm,adapters,codegen}`, `supabase/`, Inngest config, `apps/web/.env.local*`. Root config edits: `vitest.workspace.ts` (hard-codes the 5 package configs — rewrite), `pnpm-workspace.yaml`/`turbo.json`/`tsconfig.base.json` (glob/generic — light touch).
- **Reworked:** `apps/desktop` — currently a thin shell that loads `localhost:3000/wizard` and spawns web+inngest. Its reusable main-process code (`main/preload/process-manager/terminal-manager.ts`), electron-builder config, and `build/` icons survive; the web+inngest wiring is removed and a real electron-vite + React renderer is added.
- **New root files:** `docs/` (PRD v2 primary, `docs/archive/` for v1 PRD + IR-schemas), a root `CLAUDE.md` working agreement v2 (same invariant spirit: gates, approvals, no silent mutation, user's-own-Claude, no keys stored).
- **New runtime dependency:** the user's local Claude Code install and login; the app proxies no model traffic and stores no provider keys.
- **Launch gate / risk:** wrapping Claude Code means the user's plan/credit rules apply to third-party-initiated usage; current Anthropic policy and the correct wrapper self-identification must be verified in official docs before any public ship (PRD §13).
- **Platforms:** macOS first; Windows/Linux deferred (node-pty, path handling, process signals are the portability risk, isolated behind the PTY service).
