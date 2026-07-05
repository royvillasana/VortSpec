## ADDED Requirements

### Requirement: Artifacts pause the flow for approval

When a stage produces an artifact (enriched brief, spec, plan), the flow SHALL pause in "needs review". The artifact SHALL render as a formatted, readable document. Nothing downstream advances without explicit user approval.

#### Scenario: Stage produces an artifact

- **WHEN** a stage generates a brief, spec, or plan
- **THEN** the flow enters "needs review", renders the artifact as a formatted document, and blocks the next stage until the user acts

### Requirement: Approve advances, request-changes revises

The artifact review SHALL offer two actions: Approve (advances the flow) and Request changes (a text box whose content is fed back to the agent for revision). Implementation SHALL NOT proceed on any artifact that has not been approved.

#### Scenario: User approves

- **WHEN** the user approves a reviewed artifact
- **THEN** the flow advances to the next stage

#### Scenario: User requests changes

- **WHEN** the user enters revision notes and submits Request changes
- **THEN** the notes are fed back to the agent, the artifact is regenerated, and the flow remains gated until the revised artifact is approved

### Requirement: Gate enforcement is authoritative

VortSpec SHALL enforce the approval gates the CLI could only recommend; no silent mutation of downstream state occurs without a recorded approval.

#### Scenario: No approval, no advance

- **WHEN** an artifact is in "needs review" and the user has taken no action
- **THEN** no implementation step runs and no downstream files are mutated
