## ADDED Requirements

### Requirement: The insert flow can create a new row or column container

The insert flow SHALL let the user create a **new** flex container — a row or a column — with a chosen number of slots, not only fill one existing gap. The placeholder SHALL preview the new container's N sub-slots at their true size, and the composition run SHALL scaffold the new container (chosen axis, N children), each child empty or filled per the user's intent. A new empty container SHALL be allowed even when the project has no component roster; a container filled from the roster SHALL follow the same roster requirement as a normal composition.

#### Scenario: A new column band previews its slots

- **WHEN** the user chooses "new row" with a slot count of three
- **THEN** the placeholder SHALL preview three sub-slots laid out along the row's axis at their true size

#### Scenario: An empty new container needs no roster

- **WHEN** the user creates a new empty container and the project has no component roster
- **THEN** the run SHALL still be allowed (no roster is required to create an empty container)

#### Scenario: A new container accepts to marker-free source

- **WHEN** the user accepts a new-container option
- **THEN** the new container SHALL remain in source and no scaffold marker SHALL remain
