## ADDED Requirements

### Requirement: The user can override the inferred insert axis and choose a slot count

The compose dialog SHALL let the user explicitly choose whether the insertion is a **row** or a **column**, pre-set to the axis inferred from the container but overridable, and SHALL let the user choose how many **slots** to create. This layout slot-count SHALL be a distinct quantity from the number of AI options a run returns (1–3); the two SHALL NOT be conflated. The chosen axis and slot-count SHALL flow into both the placeholder geometry (which re-renders to match) and the composition prompt (which states the axis explicitly, overriding inference).

#### Scenario: Overriding the axis re-renders the placeholder and prompt

- **WHEN** the container infers a row but the user selects column
- **THEN** the placeholder SHALL re-render along the column axis
- **AND** the composition run's prompt SHALL instruct the composition to be inserted as a column

#### Scenario: Slot count is independent of option count

- **WHEN** the user sets a slot count
- **THEN** it SHALL change how many layout slots are created
- **AND** it SHALL NOT change how many AI options the run returns (still at most three)

### Requirement: The insert is a stepped layout-first flow

The compose dialog SHALL present the insert as two ordered steps: first a **layout** step where the user chooses the placement (into an existing gap, or a new row/column container) and how many rows/columns/slots, and only then a **compose** step where the chosen layout is shown as a fixed label (editable, returning to step 1) and the user describes or picks components to fill it. Discarding, cancelling, or erroring out of a build SHALL return the user to the layout step rather than stranding them on the compose step.

#### Scenario: Layout is chosen before composing

- **WHEN** the insert placeholder opens
- **THEN** the dialog SHALL show the layout step (placement + count) with no prompt input
- **AND** advancing to the compose step SHALL carry the chosen layout forward as an editable label

#### Scenario: Discarding a build returns to the layout step

- **WHEN** a generated build is discarded
- **THEN** the snapshot SHALL be restored
- **AND** the dialog SHALL return to the layout step for a fresh choice

### Requirement: A deferred screen-spec update surfaces in the Design sidebar

When an accepted insert owes a Screen Creation update and the user chooses **Later**, the owed update SHALL NOT be dropped; it SHALL surface as a persistent "Save changes" bar at the bottom of the Design sidebar (mirroring the inspect Apply bar) for the duration of the session, offering to run the update or dismiss it per screen.

#### Scenario: Later moves the owed update to the sidebar

- **WHEN** the user clicks Later on the accepted-insert screen-update notice
- **THEN** the notice SHALL clear
- **AND** a Save-changes bar naming the owed screen file SHALL appear at the bottom of the Design sidebar

#### Scenario: Saving from the sidebar runs the owed update

- **WHEN** the user clicks Save changes in the sidebar bar
- **THEN** the SDD-DE Screen Creation update SHALL run for each deferred screen
- **AND** the bar SHALL clear
