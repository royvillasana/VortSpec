## ADDED Requirements

### Requirement: The canvas selection is a set, not a single element

The canvas selection SHALL be an ordered set of elements. A selection of one SHALL behave exactly as the single selection does today, so nothing about the one-element case regresses. Every surface that reads the selection — the attributes panel, the layer tree, the assistant's context, delete, and drag-move — SHALL read the set.

#### Scenario: One selected behaves as before
- **WHEN** exactly one element is selected
- **THEN** every panel and overlay SHALL behave as it does for a single selection today

#### Scenario: The set has a focused member
- **WHEN** several elements are selected
- **THEN** one SHALL be the focused member, and single-target operations that cannot fan out SHALL act on it
- **AND** the focused member SHALL be distinguishable on the canvas from the rest of the set

#### Scenario: Selection survives what a single selection survives
- **WHEN** the canvas reloads and the selected elements can be re-acquired
- **THEN** the set SHALL be restored, and members that cannot be re-acquired SHALL be dropped rather than replaced by a wrong element

### Requirement: Additive selection on the canvas and in the layer tree

The user SHALL be able to add to and remove from the selection with a modifier-click (Shift or the platform's Cmd/Ctrl) both on the canvas and in the layer tree, and to clear the whole selection with `Escape`. A plain click SHALL replace the selection.

#### Scenario: Modifier-click adds
- **WHEN** the user modifier-clicks an unselected element
- **THEN** it SHALL be added to the selection and become the focused member

#### Scenario: Modifier-click removes
- **WHEN** the user modifier-clicks an element already in the selection
- **THEN** it SHALL be removed from the selection
- **AND** if it was the focused member, another member SHALL take focus

#### Scenario: Plain click replaces
- **WHEN** the user clicks an element with no modifier
- **THEN** the selection SHALL become exactly that element

#### Scenario: Escape clears
- **WHEN** the user presses `Escape` with any selection
- **THEN** the selection SHALL be emptied

#### Scenario: The tree and the canvas are one selection
- **WHEN** the user selects in the layer tree
- **THEN** the canvas SHALL show the same set, and the reverse SHALL also hold

### Requirement: Marquee selection on the canvas

The user SHALL be able to drag a marquee on empty canvas space to select every element it encloses. A marquee begun with a modifier held SHALL add to the existing selection rather than replace it.

#### Scenario: Marquee selects what it encloses
- **WHEN** the user drags a marquee across a region
- **THEN** every element enclosed by it SHALL be selected

#### Scenario: A marquee does not start on an element
- **WHEN** the drag begins on an element rather than empty space
- **THEN** it SHALL be treated as that element's drag-move, not as a marquee

#### Scenario: Modifier-marquee adds
- **WHEN** the user drags a marquee with the modifier held
- **THEN** the enclosed elements SHALL be added to the existing selection

### Requirement: Select all matching

From a selected element the user SHALL be able to extend the selection to every element on the page that matches it by an explicit, named criterion: the same `data-component`, the same tag, or the same binding to a given token. The resulting set SHALL be selected and highlighted on the canvas so it can be reviewed and corrected before any edit.

#### Scenario: Select every instance of a component
- **WHEN** the user chooses "select all Buttons" from a selected Button
- **THEN** every Button on the page SHALL be selected and highlighted

#### Scenario: Select everything bound to a token
- **WHEN** the user chooses to select everything whose `border-radius` resolves to `--radius-card`
- **THEN** every such element SHALL be selected, whatever component it belongs to

#### Scenario: The criterion is named, never guessed
- **WHEN** a select-all-matching action is offered
- **THEN** it SHALL state the criterion and the number of matches it would select

#### Scenario: The result is reviewable before it is edited
- **WHEN** the matched set is selected
- **THEN** the user SHALL be able to remove members before committing any edit

### Requirement: A heterogeneous selection edits by intersection

With several elements selected, the attributes panel SHALL show a property's value when every member agrees on it, and SHALL show `Mixed` when they do not. Committing a value SHALL write **only the properties the user actually edited**, leaving every untouched property as it was on each member — including properties currently showing `Mixed`.

#### Scenario: Shared values are shown and editable
- **WHEN** every selected element has `border-radius: 8px`
- **THEN** the field SHALL show `8px` and editing it SHALL set all of them

#### Scenario: Differing values read Mixed
- **WHEN** the selected elements have different radii
- **THEN** the field SHALL read `Mixed` rather than any one member's value

#### Scenario: Mixed is never silently flattened
- **WHEN** the user edits padding on a selection whose radii are `Mixed`
- **THEN** only padding SHALL be written
- **AND** each member SHALL keep its own radius

#### Scenario: Editing a Mixed field sets it for all
- **WHEN** the user types a value into a field reading `Mixed`
- **THEN** every selected element SHALL take that value
