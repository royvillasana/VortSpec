## ADDED Requirements

### Requirement: Workbench region model
The IDE SHALL organize its working area into four regions — a primary sidebar (left), an editor group (center), a panel group (bottom or side), and a secondary sidebar (right, the assistant) — arranged around the activity bar and status bar. Each region SHALL be an independently sized area; the editor group and panel group SHALL share the center column.

#### Scenario: The workbench renders its regions
- **WHEN** a workspace is open
- **THEN** the activity bar, primary sidebar, editor group, panel group, secondary sidebar, and status bar are laid out as distinct regions

#### Scenario: The center splits into editor and panel
- **WHEN** the panel group is docked to the bottom
- **THEN** the editor group occupies the top of the center column and the panel group occupies the bottom, separated by a draggable divider

### Requirement: Panel group with Terminal tab
The panel group SHALL present its contents as tabs and SHALL include a **Terminal** tab (the integrated terminal). The tab model SHALL be extensible to additional panels. Selecting a tab SHALL show that content in the panel group. (The preview is NOT a panel tab — see the `ide-preview-bar` capability.)

#### Scenario: Terminal shows in the panel group
- **WHEN** the panel group is open with the Terminal tab selected
- **THEN** the integrated terminal is shown in the panel, spawned in the workspace root

#### Scenario: Open a new terminal after closing one
- **WHEN** the user closes the Terminal tab (terminating the session) and later reopens a terminal
- **THEN** a fresh terminal session starts in the workspace root

### Requirement: Collapse, close, and reopen regions
Each region SHALL be independently collapsible and closeable, and SHALL be reopenable afterward. Closing the primary sidebar, secondary sidebar, panel group, or editor group SHALL remove it from the layout; a corresponding control (status bar and/or activity bar) SHALL reopen it.

#### Scenario: Close and reopen the assistant
- **WHEN** the user closes the secondary sidebar (assistant)
- **THEN** it is removed from the layout and the center regions expand to fill the space
- **WHEN** the user reopens it from the status bar / activity bar
- **THEN** it returns at its previous width

#### Scenario: Close the editor, leaving the panel group
- **WHEN** the user closes the editor group while the panel group is open
- **THEN** the panel group (Terminal) fills the center column and the editor is hidden
- **WHEN** the user reopens the editor group
- **THEN** the previously open tabs are restored

### Requirement: Move the panel group between bottom and side
The panel group SHALL be movable between a bottom dock (below the editor) and a side dock (beside the editor). Moving it SHALL preserve its open tabs and selection.

#### Scenario: Dock the panel to the side
- **WHEN** the panel group is docked at the bottom and the user moves it to the side
- **THEN** the panel group renders as a column beside the editor group with the same tabs selected

### Requirement: Persisted layout
The workbench SHALL persist region sizes, open/closed state, the panel-group dock position, and the selected panel tab across app restarts, and SHALL restore them on load. Restored sizes SHALL be clamped so no region starves the editor or overflows the window.

#### Scenario: Layout survives a restart
- **WHEN** the user resizes regions, moves the panel to the side, and closes the assistant, then restarts the app
- **THEN** the same sizes, dock position, and closed assistant are restored, clamped to the current window size

### Requirement: Activity-conditional primary sidebar
The primary sidebar SHALL be shown for the code/folder view and SHALL be hidden for full-screen panel activities (Pipeline, Playground, Tokens, Tasks, Manifest, Source Control shown as a panel). On the Playground and design-flow views, only the secondary sidebar (assistant) SHALL be available, and only when the user opens it.

#### Scenario: Switching to a panel hides the Explorer
- **WHEN** the user switches from the code view to the Playground (or Tokens/Pipeline/Manifest)
- **THEN** the Explorer primary sidebar is hidden and the panel fills the working area
- **WHEN** the user switches back to the code view
- **THEN** the Explorer primary sidebar returns

#### Scenario: Assistant optional on the design flow
- **WHEN** the user is on the Playground / design-flow view
- **THEN** the assistant secondary sidebar is shown only if the user has it open, and can be closed and reopened
