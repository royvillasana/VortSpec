# shared-core Specification

## Purpose
TBD - created by archiving change vortspec-ide. Update Purpose after archive.
## Requirements
### Requirement: Single shared engine consumed by both apps
The SDD-DE engine — the AgentAdapter, run-manager/recorder, Git adapter + providers, task/Jira layer, readers/parsers (tokens, components, manifest, usage), dev-server, and profile/settings — SHALL live once in `packages/core`, and both `apps/desktop` and `apps/ide` SHALL depend on it. Neither app SHALL contain its own copy of this engine.

#### Scenario: Both apps import the same core module
- **WHEN** either app needs to launch a Claude Code run, read tokens/components/manifest, or run a Git/provider operation
- **THEN** it imports the implementation from `@vortspec/core` and does not re-implement or fork that logic

#### Scenario: A pre-DESIGN.md procedure change lands in both apps
- **WHEN** a change is made to the SDD-DE procedure that runs before `DESIGN.md` (e.g. a prompt, verify step, or reader is edited in `packages/core`)
- **THEN** the change takes effect in both the cockpit and the IDE with no per-app duplication or re-implementation

### Requirement: Core is headless (no renderer or Electron-renderer imports)
`packages/core` SHALL contain only app-agnostic code: the Zod IPC contracts/types and the main-process engine. It SHALL NOT import React, renderer code, or Monaco.

#### Scenario: Core stays UI-free
- **WHEN** `packages/core` is built
- **THEN** it has no dependency on React, the renderer, or any editor UI, so either app shell can consume it unchanged

### Requirement: One IPC handler set registered by both shells
The IPC handler set (the `window.vortspec` surface) SHALL be defined once in `packages/core` and registered identically by both apps' main processes, so the preload API is the same in both.

#### Scenario: Identical API surface
- **WHEN** the IDE's main process starts
- **THEN** it registers the same `core` IPC handlers the cockpit registers, and the renderer `api.*` methods behave identically in both apps

### Requirement: Reusable panels live in a shared UI package
The renderer surfaces shared across both apps — the `vs-*` design tokens and the panels/components (Source Control, Run app, Tasks, Tokens, Manifest, Profile, RunProgress, AssistantDock, and guided-flow building blocks) — SHALL live in `packages/ui`, which both apps import.

#### Scenario: Shared panel renders in both apps
- **WHEN** the Source Control (or Tokens, Tasks, Manifest, Profile) panel is shown in either app
- **THEN** it is the same component from `packages/ui`, styled by the same `vs-*` tokens, with no forked copy in either app

### Requirement: Cockpit behavior is unchanged by the extraction
Extracting `packages/core` and `packages/ui` SHALL NOT change the cockpit's behavior. All existing `apps/desktop` unit and component tests SHALL pass after the extraction.

#### Scenario: Green cockpit after the move
- **WHEN** the core/ui extraction is complete and `apps/desktop` is repointed to the packages
- **THEN** `pnpm build && pnpm test && pnpm lint` are green and the cockpit's end-to-end flow behaves exactly as before

