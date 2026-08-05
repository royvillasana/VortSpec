## RENAMED Requirements

- FROM: `### Requirement: Interactive terminal in both apps`
- TO: `### Requirement: Interactive terminal in the IDE`

## MODIFIED Requirements

### Requirement: Interactive terminal in the IDE
The IDE (`apps/ide`) SHALL provide an interactive terminal backed by a real PTY (node-pty) and rendered with xterm.js. The implementation SHALL stay split: the PTY/process layer in `packages/core` and the xterm renderer component in `packages/ui`. That split is retained deliberately after the cockpit's removal — it is what keeps the PTY layer headless and testable without a renderer, independent of how many shells consume it.

#### Scenario: Terminal available in the IDE
- **WHEN** the user opens the terminal panel in the IDE
- **THEN** the shared terminal component is mounted, backed by the core PTY layer

#### Scenario: The PTY layer stays renderer-free
- **WHEN** `packages/core`'s terminal/PTY layer is built or unit-tested
- **THEN** it requires no renderer, no xterm.js, and no Electron renderer imports
