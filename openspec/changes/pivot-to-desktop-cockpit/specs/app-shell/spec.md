## REMOVED Requirements

### Requirement: Shared inspector layout shell
**Reason**: v1 web inspector shell replaced by the Electron desktop app shell (PRD v2 pivot).
**Migration**: Desktop shell is defined by the new desktop capabilities (`workspace-toolkit` dashboard, `guided-sdd-flow`, `run-view`).

### Requirement: Project header in nav rail
**Reason**: Web nav rail removed with the inspector shell.
**Migration**: Project identity now lives in the desktop project dashboard (`workspace-toolkit`).

### Requirement: Navigation links
**Reason**: Web nav removed with the inspector shell.
**Migration**: Navigation is the guided SDD stepper plus the dashboard (`guided-sdd-flow`, `workspace-toolkit`).

### Requirement: Issues badge count
**Reason**: Web inspector issues surface removed.
**Migration**: Findings surface as verification review cards in `guided-sdd-flow`/`run-view`.

### Requirement: Settings link
**Reason**: Web inspector shell removed.
**Migration**: App-level settings belong to the Electron app; no VortSpec account or provider keys exist in v2.

### Requirement: Chat strip toggle
**Reason**: Web conversational strip removed.
**Migration**: Agent interaction is the embedded terminal plus `artifact-gates` request-changes.

### Requirement: Global dark theme
**Reason**: Requirement re-homed to the Electron renderer.
**Migration**: The v1 `--color-vs-*` tokens and dark theme are extracted from `apps/web/src/app/globals.css` into the renderer stylesheet.
