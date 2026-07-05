## REMOVED Requirements

### Requirement: New Import page layout
**Reason**: Web import flow superseded by local `design-input` (PRD v2 pivot).
**Migration**: Use `design-input` (Figma link via MCP, dropped ZIP, or existing folder/repo).

### Requirement: ZIP upload via drag-and-drop
**Reason**: Superseded by local ZIP handling.
**Migration**: `design-input` places dropped ZIPs at the project's expected input path.

### Requirement: Figma connection option
**Reason**: Server-side Figma REST connection removed.
**Migration**: Figma is reached through the user's Figma MCP in Claude Code (`design-input`).

### Requirement: Companion design system attachment
**Reason**: Server-side ingestion removed.
**Migration**: Companion artifacts live as files in the project folder consumed by the SDD-DE step.

### Requirement: Start import button state
**Reason**: Web import trigger removed.
**Migration**: Runs are launched by the guided flow (`guided-sdd-flow`, `agent-runner`).

### Requirement: Import progress tracking
**Reason**: Server-side pipeline progress removed.
**Migration**: Progress is the live run view over parsed Claude Code events (`run-view`).

### Requirement: Navigation to inspector on completion
**Reason**: Web inspector removed.
**Migration**: Completion advances the SDD stepper (`guided-sdd-flow`).
