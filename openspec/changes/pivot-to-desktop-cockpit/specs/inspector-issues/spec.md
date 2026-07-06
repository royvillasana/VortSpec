## REMOVED Requirements

### Requirement: Issue list display
**Reason**: v1 project-wide issue tracker superseded by verification review cards (PRD v2 pivot).
**Migration**: Findings render as severity-tagged review cards in `guided-sdd-flow` verification stages.

### Requirement: Filter by severity
**Reason**: Web issue tracker removed.
**Migration**: Verification cards carry severity in `guided-sdd-flow`/`run-view`.

### Requirement: Filter by kind
**Reason**: Web issue tracker removed.
**Migration**: None in v2 (findings scoped per verification stage).

### Requirement: Filter by component
**Reason**: Web issue tracker removed.
**Migration**: None in v2.

### Requirement: Deep link to target
**Reason**: Web inspector deep links removed.
**Migration**: Findings reference file paths surfaced in `run-view`.

### Requirement: One-click suggested action
**Reason**: IR-patch suggested actions retired.
**Migration**: Findings are approved or sent back to the agent for revision (`guided-sdd-flow`).

### Requirement: Issue count summary
**Reason**: Web issue tracker removed.
**Migration**: None in v2.
