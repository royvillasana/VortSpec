## REMOVED Requirements

### Requirement: Chat drawer layout
**Reason**: v1 web chat assistant superseded by the embedded terminal plus artifact request-changes (PRD v2 pivot).
**Migration**: Agent interaction is the embedded PTY terminal (`run-view`) and `artifact-gates` request-changes.

### Requirement: Natural language commands
**Reason**: Server-side conversational editing removed; the agent is the user's Claude Code.
**Migration**: Users converse with the agent through the terminal and revision notes on artifacts.

### Requirement: Patch diff preview
**Reason**: IR-patch diff model retired.
**Migration**: File edits are surfaced with paths in `run-view`; changes live in the project and git.

### Requirement: Approve or reject patches
**Reason**: IR-patch approval superseded by artifact-level gates.
**Migration**: Use `artifact-gates` (Approve / Request changes) over briefs, specs, and plans.

### Requirement: Ambiguity clarification
**Reason**: Server-side clarification loop removed.
**Migration**: Clarification happens in the intake wizard (`intake-forms`) and the PTY fallback (`agent-runner`).

### Requirement: Optimistic concurrency
**Reason**: IR `baseVersion` concurrency model retired.
**Migration**: None in v2; the project folder plus git are the source of truth.

### Requirement: Chat message history
**Reason**: Server-side chat persistence removed.
**Migration**: Run activity is recorded locally (`run-history`); no VortSpec-side chat store exists.
