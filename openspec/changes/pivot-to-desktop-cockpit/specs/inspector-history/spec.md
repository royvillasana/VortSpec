## REMOVED Requirements

### Requirement: Patch history timeline
**Reason**: v1 IR-patch history superseded by local run history (PRD v2 pivot).
**Migration**: Use `run-history` — runs recorded as plain files under `.vortspec/runs/`, browsable as a timeline.

### Requirement: Author attribution
**Reason**: IR-patch author model retired.
**Migration**: Run records capture stages, decisions, and outcomes (`run-history`).

### Requirement: Linear undo
**Reason**: IR undo retired; state is derived from files on disk plus the run log.
**Migration**: None in v2; recovery is via files and git, not an in-app undo stack.

### Requirement: Patch detail expansion
**Reason**: IR-patch detail retired.
**Migration**: Run detail is openable from the `run-history` timeline.

### Requirement: Version tracking
**Reason**: IR `baseVersion` optimistic-concurrency model retired.
**Migration**: None in v2; the project folder and git are the source of truth.
