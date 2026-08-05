## RENAMED Requirements

- FROM: `### Requirement: Single shared engine consumed by both apps`
- TO: `### Requirement: Single shared engine in packages/core`
- FROM: `### Requirement: One IPC handler set registered by both shells`
- TO: `### Requirement: One IPC handler set registered by the shell`

## MODIFIED Requirements

### Requirement: Single shared engine in packages/core
The SDD-DE engine — the AgentAdapter, run-manager/recorder, Git adapter + providers, task/Jira layer, readers/parsers (tokens, components, manifest, usage), dev-server, and profile/settings — SHALL live once in `packages/core`, and the app SHALL depend on it rather than containing its own copy.

The package boundary is retained after the cockpit's removal on its own merits, not because two shells consume it: it is what keeps the engine headless and unit-testable without an Electron renderer, and what stops app-shell concerns leaking into the engine. A future second shell is not required to justify it.

#### Scenario: The app imports the engine rather than re-implementing it
- **WHEN** the app needs to launch a Claude Code run, read tokens/components/manifest, or run a Git/provider operation
- **THEN** it imports the implementation from `@vortspec/core` and does not re-implement or fork that logic

#### Scenario: A pre-DESIGN.md procedure change lands in one place
- **WHEN** a change is made to the SDD-DE procedure that runs before `DESIGN.md` (e.g. a prompt, verify step, or reader is edited in `packages/core`)
- **THEN** the change takes effect in the app with no per-shell duplication

### Requirement: One IPC handler set registered by the shell
The IPC handler set (the `window.vortspec` surface) SHALL be defined once in `packages/core` and registered by the app's main process, so the preload API has exactly one definition.

#### Scenario: The renderer API comes from core
- **WHEN** the IDE's main process starts
- **THEN** it registers the `core` IPC handlers, and the renderer's `api.*` methods are the surface those handlers define

#### Scenario: The mock API cannot drift from the contract
- **WHEN** a method is added to the `VortSpecApi` surface
- **THEN** the component-test mock fails type-checking until it implements that method with the declared shape

### Requirement: Reusable panels live in a shared UI package
The renderer surfaces — the `vs-*` design tokens and the panels/components (Source Control, Run app, Tasks, Tokens, Manifest, Profile, RunProgress, AssistantDock, and guided-flow building blocks) — SHALL live in `packages/ui`, which the app imports.

#### Scenario: A panel has one definition
- **WHEN** the Source Control (or Tokens, Tasks, Manifest, Profile) panel is shown
- **THEN** it is the component from `packages/ui`, styled by the same `vs-*` tokens, with no forked copy in the app

## REMOVED Requirements

### Requirement: Cockpit behavior is unchanged by the extraction
**Reason**: A migration-era guarantee about a one-time move that completed long ago — "extracting `packages/core` and `packages/ui` SHALL NOT change the cockpit's behavior". With the cockpit deleted there is nothing left to keep unchanged, and the extraction it guarded is history rather than an ongoing obligation. Reworded it would say nothing.

**Migration**: None. The ongoing obligations it implied — the engine lives in `packages/core`, the panels in `packages/ui`, neither forked — are stated by the requirements above and are unaffected.
