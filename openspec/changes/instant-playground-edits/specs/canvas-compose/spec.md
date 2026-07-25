## MODIFIED Requirements

### Requirement: Composition requires an expressed intent

Composition splits by input modality. **Direct manipulation** — inserting a known component from the picker, moving, duplicating, or deleting an element — SHALL be handled deterministically and SHALL NOT require a prompt or start an AI run. An **AI composition run** SHALL be reserved for **language-expressed** novel composition (the user describes what belongs in a slot that no direct-manipulation op resolves) and SHALL NOT start from a placeholder alone: the user SHALL provide a prompt describing what belongs there. Until such an intent is expressed, the control that starts the AI run SHALL be disabled and SHALL explain what is missing.

#### Scenario: Insert from the picker needs no prompt

- **WHEN** the user drops a known component from the picker into a resolvable slot
- **THEN** it SHALL be inserted deterministically with no prompt and no AI run

#### Scenario: Empty prompt cannot generate

- **WHEN** an AI composition placeholder is active and no prompt has been entered
- **THEN** the generate control SHALL be disabled and SHALL state that a prompt is needed

#### Scenario: A prompt enables generation

- **WHEN** the user enters a prompt for the active placeholder
- **THEN** the generate control SHALL become enabled
