## ADDED Requirements

### Requirement: On-demand push trigger only
The system SHALL push code tokens into Figma only in response to an explicit user action (the "Send to Figma" control). It SHALL NOT push automatically on token edit, on file save, on project open, or as a side effect of the Figma→code pull. VortSpec SHALL NOT open any network or MCP connection to Figma itself; the write SHALL be performed by the engine — either `figma-cli` or a scoped Claude Code run using the user's own Figma MCP.

#### Scenario: Push happens only on explicit click
- **WHEN** a user creates or edits a token in the Inspector but does not click "Send to Figma"
- **THEN** the Figma file SHALL remain unchanged
- **AND** no push run SHALL be started

#### Scenario: VortSpec never calls Figma directly
- **WHEN** a push is executed
- **THEN** the Figma write SHALL be issued by `figma-cli` or by a scoped Claude Code run using the user's own Figma MCP
- **AND** the VortSpec main/renderer processes SHALL NOT open a direct Figma network or MCP connection

### Requirement: Push plan preview and confirmation gate
Before any variable is written to Figma, the system SHALL compute a push plan from the parsed code token file diffed against the Figma-variable cache, and SHALL present it for explicit confirmation. The plan SHALL list, per token, whether it will be **created** or **updated** in Figma, its target variable name, its outgoing value (or alias target), and — for updates — the current Figma value being replaced. No variable SHALL be written to Figma until the user confirms the plan.

#### Scenario: Plan is shown before writing
- **WHEN** a user clicks "Send to Figma"
- **THEN** a preview SHALL show every token to be created and every token to be updated, with target name, outgoing value or alias, and the current Figma value for updates
- **AND** nothing SHALL be written to Figma until the user confirms

#### Scenario: Canceling the plan writes nothing
- **WHEN** the push preview is shown and the user cancels
- **THEN** no variable SHALL be created or updated in Figma
- **AND** the Figma file SHALL remain unchanged

#### Scenario: Empty plan is a no-op
- **WHEN** every code token already matches its Figma variable (nothing to create or update)
- **THEN** the preview SHALL report that Figma is already in sync
- **AND** no push run SHALL be started

### Requirement: CLI-preferred, MCP-fallback execution
The system SHALL execute the confirmed push through `figma-cli` when it is connected (fast, no Claude usage), and SHALL fall back to a scoped Claude Code run using the user's own Figma MCP when the CLI is unavailable. The MCP-fallback run SHALL use bulk variable operations — `figma_batch_create_variables` for new variables and `figma_batch_update_variables` for changed ones. When neither the CLI nor the MCP is connected, the system SHALL surface a fix-it message rather than failing silently.

#### Scenario: CLI path is used when connected
- **WHEN** `figma-cli` is connected and a push plan is confirmed
- **THEN** the push SHALL be executed via `figma-cli`
- **AND** no Claude Code run SHALL be started

#### Scenario: MCP fallback uses batch tools
- **WHEN** `figma-cli` is not connected, the Figma MCP is connected, and a push plan is confirmed
- **THEN** a scoped Claude Code run SHALL create new variables via `figma_batch_create_variables` and update changed variables via `figma_batch_update_variables`

#### Scenario: No writer connected
- **WHEN** neither `figma-cli` nor the Figma MCP is connected and the user attempts a push
- **THEN** the system SHALL show a human-readable message telling the user to connect figma-cli (preferred) or the Figma MCP
- **AND** no push run SHALL be started

### Requirement: Alias preservation for token references
When a code token is defined as a reference to another token (`var(--other)`), and a Figma variable corresponding to `--other` exists in the target collection, the push SHALL create or update the pushed variable as a Figma variable **alias** pointing at that referenced variable, rather than flattening it to a resolved concrete value. When the referenced variable does not exist in the collection, the token SHALL be pushed with its resolved concrete value.

#### Scenario: Reference becomes a Figma alias
- **WHEN** `--button-bg: var(--color-primary)` is pushed and a Figma variable for `--color-primary` exists in the target collection
- **THEN** the pushed `button-bg` variable SHALL be an alias referencing the `color-primary` variable
- **AND** it SHALL NOT be written as a flattened concrete value

#### Scenario: Unresolvable reference falls back to concrete value
- **WHEN** a token references a variable that does not exist in the target collection
- **THEN** the token SHALL be pushed with its resolved concrete value

### Requirement: Target collection and scope
The push SHALL write only to VortSpec's own `VortSpec` collection. The push SHALL NOT modify variables in other collections, component sources, styles, or layers, and SHALL NOT delete Figma variables that have no code counterpart.

#### Scenario: Writes are confined to the VortSpec collection
- **WHEN** a push is executed
- **THEN** only variables in the `VortSpec` collection SHALL be created or updated
- **AND** variables in other collections SHALL be left unchanged

#### Scenario: Figma-only variables are not deleted
- **WHEN** a Figma variable in the target collection has no matching code token
- **THEN** the push SHALL leave that variable in place and SHALL NOT delete it

### Requirement: Push targets VortSpec's own auto-created collection
The push SHALL write into a Figma Variables collection named `VortSpec` that VortSpec owns. When that collection does not exist in the file, the push SHALL create it automatically and write the tokens there — the user SHALL NOT be required to create or name a collection in Figma first. The result message SHALL report when the collection was created.

#### Scenario: Missing collection is auto-created
- **WHEN** a push is confirmed and no collection named `VortSpec` exists in the file
- **THEN** the system SHALL create the `VortSpec` collection and write the planned variables into it
- **AND** the result SHALL report that the collection was created

#### Scenario: Existing VortSpec collection is reused
- **WHEN** a push is confirmed and a `VortSpec` collection already exists
- **THEN** the system SHALL write into that existing collection without creating a duplicate

### Requirement: Composite tokens are created and pushed
Typography and shadow tokens SHALL NOT be skipped. When such a token has no corresponding representation in Figma, the push SHALL create it — decomposing a composite token into the scalar Figma variables it needs (e.g. font-family / font-size / line-height for typography; offset / blur / spread / color for shadow) under the target collection, or the equivalent supported Figma representation — and update it on subsequent pushes. The push plan SHALL account for every token type so that a completed push leaves no token type unrepresented.

#### Scenario: Typography token is created on push
- **WHEN** a typography token exists in code with no matching Figma representation and the user confirms the push
- **THEN** the push SHALL create the scalar Figma variables that represent it under the target collection
- **AND** the token SHALL NOT be skipped

#### Scenario: Every token type is covered by the plan
- **WHEN** a push plan is computed over a token file containing color, spacing, radius, typography, and shadow tokens
- **THEN** every one of those types SHALL be represented as create or update entries in the plan
- **AND** no type SHALL be silently omitted

### Requirement: Post-push reconciliation
After a push completes, the system SHALL refresh the Figma-variable cache and re-run reconciliation so that drift indicators reflect the new state, without requiring the user to trigger a separate pull.

#### Scenario: Drift clears after a successful push
- **WHEN** a push that updates a drifted token completes successfully
- **THEN** the local reconcile SHALL re-run
- **AND** that token SHALL be reported as in-sync
