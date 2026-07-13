## ADDED Requirements

### Requirement: Variable cache captures collections, modes, group paths, and aliases
The Figma variable cache (`.vortspec/figma-variables.json`) SHALL represent each variable's **collection**, its **group path** (the `/`-segmented Figma name), its **resolvedType**, and its **value in every mode** — where a per-mode value SHALL be either a concrete value or a reference to another variable (an alias). The cache SHALL also record, per collection, its ordered list of modes and its default mode. VortSpec SHALL NOT read Figma directly to produce this cache; it SHALL be written by figma-cli or a scoped Claude Code run using the user's own Figma access.

#### Scenario: A multi-mode variable stores one value per mode
- **WHEN** a Figma collection has modes `Light` and `Dark` and the variable `color/primary` has a different value in each
- **THEN** the cache SHALL store `color/primary` under its collection with a value keyed by `Light` and a value keyed by `Dark`, and its `resolvedType`

#### Scenario: An aliased per-mode value is preserved as a reference
- **WHEN** a variable's value in a mode is a Figma variable alias to another variable
- **THEN** the cache SHALL record that value as a reference to the target variable, not as a flattened concrete value only

#### Scenario: Group path is retained, not flattened
- **WHEN** a variable is named `primitive/color/primary` in Figma
- **THEN** the cache SHALL retain the full slash path so its group folders (`primitive` → `color`) and leaf label (`primary`) are recoverable

### Requirement: Legacy flat cache remains parseable
Reading the variable cache SHALL accept the legacy shapes (a flat array of `{name, resolvedValue}` or a flat `{name: value}` map) and interpret them as a single-mode collection with the path taken from each variable's name, so a cache written by a prior VortSpec version keeps working until the next sync rewrites it.

#### Scenario: Old cache loads as a single default mode
- **WHEN** `.vortspec/figma-variables.json` is a legacy flat array with no mode or collection information
- **THEN** it SHALL be interpreted as one collection with a single default mode carrying each variable's value, and reconciliation SHALL proceed without error

### Requirement: Reconciliation is per mode and by full group-qualified name
Drift between a code token and a Figma variable SHALL be computed for the **active mode**, comparing the code value in that mode's code context to the variable's value in the corresponding Figma mode, matched on the full group-qualified name rather than a name that flattens the `/` group separator away. A variable that matches in the active mode SHALL read as in-sync, not drifted.

#### Scenario: In-sync mode value is not reported as drift
- **WHEN** `color/primary` is `#7C6FF0` in Figma's Light mode and the code token `--color-primary` is `#7C6FF0` in the Light-mapped context
- **THEN** reconciliation for the Light mode SHALL report the token as in-sync

#### Scenario: A genuine per-mode difference is caught
- **WHEN** `color/primary` differs between Figma's Dark mode value and the code's Dark-mapped context value
- **THEN** reconciliation for the Dark mode SHALL report the token as drifted

#### Scenario: A mode with no code context is read-only, not drifted
- **WHEN** the Figma collection has a `Dark` mode but the token file has no context mapped to it
- **THEN** the token's Dark value SHALL be shown from Figma as read-only and SHALL NOT be reported as drift

### Requirement: Modes map to code contexts, derived and overridable
Each Figma mode SHALL be mapped to a code context (a CSS selector/scope such as `:root`, `.dark`, `[data-theme="dark"]`, or `@media (prefers-color-scheme: dark)`). The mapping SHALL be derived by default from the token file's selectors and the mode names, SHALL be viewable and editable by the user, and SHALL be persisted in the project configuration. VortSpec SHALL NOT invent a code context that does not already exist in the token file.

#### Scenario: Default mapping is derived from selectors
- **WHEN** the token file has a `:root` block and a `.dark` block and Figma has `Light`/`Dark` modes
- **THEN** VortSpec SHALL map `Light`→`:root` and `Dark`→`.dark` by default, and SHALL expose that mapping for the user to change

#### Scenario: Edited mapping persists
- **WHEN** the user changes which context a mode maps to
- **THEN** the new mapping SHALL be written to the project configuration and reused on reload

### Requirement: Push preserves mode, group path, and aliases
The code→Figma push SHALL write each value into the Figma mode mapped from the code context being pushed, SHALL name created variables with their full group path (e.g. `color/primary`, not `color-primary`) so Figma folders them correctly, and SHALL re-create `var(--x)` references as Figma variable aliases in that mode when the target variable exists and its type matches.

#### Scenario: Pushed variable keeps its folder path
- **WHEN** a token intended as `color/primary` is pushed and no such variable exists
- **THEN** the created Figma variable SHALL be named `color/primary` so it appears under the `color` folder, not as a flat `color-primary`

#### Scenario: Push targets the mapped mode
- **WHEN** the active mode is `Dark` and the user pushes a changed value
- **THEN** the value SHALL be written to the variable's `Dark` mode via `setValueForMode` for that mode, leaving other modes untouched

#### Scenario: A reference is pushed as an alias per mode
- **WHEN** a code token is `var(--color-primary)` and `color/primary` exists in Figma with a matching type in the active mode
- **THEN** the pushed value for that mode SHALL be an alias to `color/primary`, not a flattened concrete value
