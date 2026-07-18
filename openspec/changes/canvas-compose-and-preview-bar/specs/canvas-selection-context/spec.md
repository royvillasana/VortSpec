## ADDED Requirements

### Requirement: The current selection is ambient context for the assistant

When an element is selected on the canvas, that selection SHALL be offered to the assistant as **standing context** — visible as a chip on the composer — without the user having to send it. The context SHALL persist across turns for as long as the selection holds, so a follow-up prompt is grounded in the same element as the first, and SHALL NOT be consumed or cleared by submitting a prompt.

#### Scenario: Selecting grounds the composer

- **WHEN** the user selects an element on the canvas while the assistant is open
- **THEN** a context chip naming that selection SHALL appear on the composer without any further gesture

#### Scenario: Context survives a turn

- **WHEN** the user submits a prompt with a selection attached and then types a follow-up
- **THEN** the selection SHALL still be attached to the follow-up

#### Scenario: Context follows the selection

- **WHEN** the user selects a different element
- **THEN** the chip SHALL update to the new selection rather than accumulating a second one

#### Scenario: Deselecting clears the context

- **WHEN** the selection is cleared, or the selected element no longer exists after a reload
- **THEN** the chip SHALL be withdrawn and subsequent prompts SHALL NOT claim a selection

### Requirement: Selection context grounds but never acts on its own

Attaching selection context SHALL NOT start a run, send a prompt, or modify a file. The user SHALL remain able to detach the context for a prompt where it is not wanted, and SHALL be able to inspect exactly what the context contains before sending.

#### Scenario: Selecting never triggers a run

- **WHEN** an element is selected
- **THEN** no agent run SHALL start and no file SHALL be modified as a consequence

#### Scenario: Context is detachable

- **WHEN** the user dismisses the selection context chip
- **THEN** the next prompt SHALL be sent without it, while the canvas selection itself SHALL remain

#### Scenario: Context is inspectable

- **WHEN** the user expands the selection context chip
- **THEN** it SHALL show the context that will be sent

### Requirement: Selection context describes the element in the project's own terms

The context SHALL describe the selection in terms the engine can act on: its identity on screen, its owning source component and file when derivable, its current variant/prop values, and its computed values with the **design token** behind each one where token-backed. Where the owning component or the tokens are not derivable, the context SHALL omit them rather than assert a guess.

#### Scenario: Component-backed selection

- **WHEN** the selected element resolves to a known project component
- **THEN** the context SHALL name that component, its source file, and its current variant values

#### Scenario: Token-backed values name their tokens

- **WHEN** a selected element's computed values resolve through design tokens
- **THEN** the context SHALL name the owning token beside each such value

#### Scenario: Unknown provenance is omitted, not invented

- **WHEN** the selected element cannot be resolved to a project component
- **THEN** the context SHALL describe the element without naming a component or source file

### Requirement: Selection context is carried as a selection, not as a fake file range

The assistant SHALL represent canvas selection context as a first-class canvas selection. It SHALL NOT be smuggled through the editor's file-and-line-range reference shape with fabricated line numbers, because a canvas selection has no honest line range and a fabricated one misleads both the user and the engine.

#### Scenario: No fabricated line numbers

- **WHEN** a canvas selection is attached to the composer
- **THEN** it SHALL be carried as a canvas selection with its own identity
- **AND** it SHALL NOT claim a source line range it does not have

#### Scenario: Editor references still work

- **WHEN** the user sends a real code selection from the editor
- **THEN** it SHALL still be carried with its true file path and line range, alongside any canvas selection
