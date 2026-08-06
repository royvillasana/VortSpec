## ADDED Requirements

### Requirement: An edit defaults to the narrowest scope it can have

A style edit on a single selected element SHALL default to that element alone, whatever component identity or design token the element carries. A wider scope SHALL be reached only by an explicit choice.

The asymmetry is the reason: a narrow edit that should have been wide costs one more action, while a wide edit that should have been narrow silently rewrites work elsewhere — and through a token, on pages the user is not looking at.

#### Scenario: Editing one instance of a component

- **WHEN** a user selects one element that is an instance of a component and changes a style value
- **THEN** only that element changes

#### Scenario: A token-backed value does not widen the edit by itself

- **WHEN** the value being edited resolves from a design token
- **THEN** the edit still defaults to the selected element, and neither the token nor a component-scoped redefinition is written unless chosen

#### Scenario: A deliberate multi-selection is respected

- **WHEN** a user selects several elements and changes a style value
- **THEN** the edit applies to those elements, because selecting them was the choice

### Requirement: Widening is offered after the edit, not assumed before it

After a single-element edit is applied, the app SHALL offer to apply the same change to every instance of that element's component, and SHALL leave the narrow edit in place unless the offer is accepted. The offer SHALL name what it would affect.

Offering afterwards rather than pre-selecting means the predictable result exists first and the broad one is an answer to a direct question.

#### Scenario: The offer appears and is declined

- **WHEN** a user edits one instance of a component and does not accept the offer to widen
- **THEN** only that element is changed and nothing else is written

#### Scenario: The offer is accepted

- **WHEN** the user accepts the offer
- **THEN** every instance of that component receives the same change

#### Scenario: Nothing to widen to

- **WHEN** the edited element has no component identity, or is the only instance of its component
- **THEN** no offer is made

#### Scenario: The offer states its reach

- **WHEN** the offer is shown
- **THEN** it says which component and how many instances would change
