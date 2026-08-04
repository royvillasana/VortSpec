## MODIFIED Requirements

### Requirement: The current selection is ambient context for the assistant

When one or more elements are selected on the canvas, that selection SHALL be offered to the assistant as **standing context** — visible as a chip on the composer — without the user having to send it. The context SHALL persist across turns for as long as the selection holds, so a follow-up prompt is grounded in the same elements as the first, and SHALL NOT be consumed or cleared by submitting a prompt.

A selection of several elements SHALL be carried as **one** context — a set — not as one chip per element. The chip SHALL state the count and, when the members share a component or a token binding, what they have in common, so the assistant and the user agree on what "the selection" means.

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

#### Scenario: A multi-selection is one chip that states its size

- **WHEN** the user selects five elements
- **THEN** exactly one chip SHALL be shown, naming five elements rather than listing five chips

#### Scenario: The chip names what the members share

- **WHEN** every selected element is a Button
- **THEN** the chip SHALL say so, rather than describing only the focused member

#### Scenario: Partial re-acquisition is stated honestly

- **WHEN** the canvas reloads and only some selected elements can be re-acquired
- **THEN** the chip SHALL reflect the elements actually still selected, and SHALL NOT claim the original count
