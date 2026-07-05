## REMOVED Requirements

### Requirement: Component cards grid
**Reason**: Component factory logic is now Claude Code's job; v1 web component inspector out of scope for v2 (PRD v2 pivot).
**Migration**: Generated components are real files in the project; progress shows in `run-view`.

### Requirement: Component detail view with Playground
**Reason**: Web component playground removed.
**Migration**: Preview generated components via `dev-preview` running the project's real dev server.

### Requirement: Variant selector controls
**Reason**: Web component inspector removed.
**Migration**: None in v2; component variants live in generated code.

### Requirement: Prop controls from ControlHint
**Reason**: IR ControlHint model retired.
**Migration**: None in v2.

### Requirement: Inline token list
**Reason**: IR token-reference model retired.
**Migration**: None in v2.

### Requirement: Checks row
**Reason**: Web completeness scoring removed.
**Migration**: Verification is handled by SDD-DE verification stages (`guided-sdd-flow`).

### Requirement: Variant matrix
**Reason**: Web component inspector removed.
**Migration**: None in v2.

### Requirement: Component rename and edit
**Reason**: IR-mutating editing removed.
**Migration**: None in v2; edits happen in code under approval gates.

### Requirement: Component approval
**Reason**: Web component approval gate removed.
**Migration**: Approval is generalized to `artifact-gates` over briefs/specs/plans.

### Requirement: Inferred items confirmation
**Reason**: IR inference/provenance model retired.
**Migration**: None in v2.
