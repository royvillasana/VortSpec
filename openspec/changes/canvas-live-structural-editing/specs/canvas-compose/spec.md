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
