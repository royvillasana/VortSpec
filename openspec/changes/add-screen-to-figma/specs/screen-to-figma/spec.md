## ADDED Requirements

### Requirement: Explicit send trigger only, never call Figma directly
The system SHALL send a screen to Figma only in response to an explicit user action (the toolbar "Send to Figma" control). It SHALL NOT send automatically on edit, save, navigation, or project open. VortSpec SHALL NOT open any direct network or MCP connection to Figma itself; the write SHALL be performed by the engine — `figma-cli` or a scoped Claude Code run using the user's own Figma MCP.

#### Scenario: Send happens only on explicit click
- **WHEN** a user builds or navigates a screen in the Playground but does not click "Send to Figma"
- **THEN** no Figma file SHALL be created or modified
- **AND** no send run SHALL be started

#### Scenario: VortSpec never calls Figma directly
- **WHEN** a send or pull-back is executed
- **THEN** the Figma read/write SHALL be issued by `figma-cli` or by a scoped Claude Code run using the user's own Figma MCP
- **AND** the VortSpec main/renderer processes SHALL NOT open a direct Figma network or MCP connection

### Requirement: Send the current screen as a design-system-linked view
On send, the system SHALL translate the **currently-previewed** screen (resolved from the active route/screen's source file) into Figma as component instances bound to the design system's components, with colors, spacing, and radii bound to design-system variables and typography/effects applied as styles — not as hardcoded values. A pixel/image capture of the running preview MAY be used as a visual reference but SHALL NOT be the delivered artifact; any such capture SHALL be removed once its images/layout are transferred.

#### Scenario: The previewed screen is what gets sent
- **WHEN** a user is previewing a specific screen and clicks "Send to Figma"
- **THEN** the screen sent SHALL be the one resolved from the currently-previewed route/screen source, not another screen

#### Scenario: Output is DS-linked, not a flat raster
- **WHEN** a send completes and the design system exposes matching components and variables
- **THEN** the Figma frame SHALL use component instances and variable/style bindings for the covered elements
- **AND** any raster capture used for reference SHALL be deleted from the file

#### Scenario: Code components resolve to the mapped design-system component
- **WHEN** the screen uses a code component that has a recorded Figma mapping (`figmaNodeId`/`componentKey` in `components.json`)
- **THEN** the send SHALL instance that mapped design-system component — for a local (in-file) component, by instancing the node at `figmaNodeId`; for a published-library component, by importing it via `componentKey`
- **AND** SHALL only fall back to a manually-built frame for an element when no mapping resolves

### Requirement: Target the project's design-system file so its components are usable
The system SHALL send the screen into the project's existing design-system Figma file (the file the components live in, from `components.json` `fileKey` / `project.yaml` `figma_file_url`), on a dedicated Screens page or section, so that local (file-scoped) design-system components can be instanced. It SHALL create a separate `VortSpec — <project> Screens` file only as a fallback when no design-system file is recorded (or the design system is a published external library). It SHALL persist the mapping between each screen and its Figma node in `.vortspec/maps/screens.json` — the target `fileKey` and, per screen, its source file and Figma `nodeId` — and reuse that mapping so a subsequent send updates the existing frame and a pull-back targets the correct node.

#### Scenario: Send targets the existing design-system file
- **WHEN** a screen is sent and the project has a recorded design-system Figma file
- **THEN** the screen SHALL be built in that same file (on a Screens page/section)
- **AND** that file's `fileKey` SHALL be recorded in `.vortspec/maps/screens.json`

#### Scenario: Fallback file only when no design-system file exists
- **WHEN** a screen is sent and no design-system Figma file is recorded for the project
- **THEN** a separate `VortSpec — <project> Screens` file SHALL be created and its `fileKey` persisted

#### Scenario: Re-sending a screen updates its existing frame
- **WHEN** a screen with a recorded `nodeId` is sent again
- **THEN** the system SHALL update the existing Figma frame for that screen
- **AND** SHALL NOT create a duplicate frame

### Requirement: Reviewed pull-back of Figma edits
The system SHALL provide a "Pull changes back" action for a screen that has a recorded Figma mapping. It SHALL read the mapped Figma node and apply the resulting changes to the screen's source file under a review gate — the change is shown and NOT committed to disk until the user Keeps it, and can be reverted — consistent with the canvas Apply flow.

#### Scenario: Pull-back is gated like an Apply
- **WHEN** a user clicks "Pull changes back" and edits are produced from the mapped Figma node
- **THEN** the changes SHALL be presented for review (Keep/Revert) before being kept on disk
- **AND** choosing Revert SHALL restore the screen source to its pre-pull state

#### Scenario: Pull-back requires an existing mapping
- **WHEN** a screen has no entry in `.vortspec/maps/screens.json`
- **THEN** the "Pull changes back" action SHALL be unavailable until the screen has been sent at least once

### Requirement: CLI-preferred, MCP-fallback execution with a connection gate
The system SHALL execute the send/pull through `figma-cli` when it is connected, and fall back to a scoped Claude Code run using the user's own Figma MCP (started with `bypassPermissions` and without `strictMcp`, so the user's Figma server is reachable) otherwise. When neither `figma-cli` nor the user's Figma MCP is connected, the send control SHALL be disabled and SHALL surface a "Connect Figma" affordance rather than failing silently.

#### Scenario: Disabled and guided when Figma is not connected
- **WHEN** neither `figma-cli` nor the user's Figma MCP is connected
- **THEN** the "Send to Figma" control SHALL be disabled
- **AND** SHALL present a way to connect Figma

#### Scenario: MCP-fallback run reaches the user's Figma
- **WHEN** `figma-cli` is not connected and a send/pull run is started
- **THEN** the run SHALL be started with `bypassPermissions` and without `strictMcp`
- **AND** SHALL use the user's own globally-configured Figma MCP server
