# ide-preview-bar Specification

## Purpose
TBD - created by archiving change ide-vscode-workbench. Update Purpose after archive.
## Requirements
### Requirement: Preview nav bar at the bottom of the editor
The IDE SHALL replace the embedded preview pane with a slim **preview bar** pinned to the bottom of the editor. In its collapsed (default) state the bar SHALL show, on one row with the current dark background: a **"Preview"** label, an **App / Storybook** selector (choosing which dev server the bar targets), and — on the far right — an **Open Browser** action with a **collapse/expand arrow** next to it.

#### Scenario: The preview bar renders collapsed by default
- **WHEN** a workspace is open and the editor group is on screen
- **THEN** a single-row preview bar is shown at the bottom of the editor with the "Preview" label, the App/Storybook selector, an "Open Browser" action, and an expand arrow — collapsed, on the dark background

#### Scenario: The preview bar is bound to the editor group
- **WHEN** the editor group is closed (e.g. leaving only the panel group, or on a full-screen panel activity)
- **THEN** the preview bar is not shown
- **WHEN** the editor group is reopened / active
- **THEN** the preview bar reappears at the bottom of the editor

#### Scenario: App / Storybook selector targets the dev server
- **WHEN** the user selects "App" or "Storybook" in the bar
- **THEN** the bar targets that dev server for Open Browser and for the environment details

### Requirement: Open Browser opens the dev server externally
The bar SHALL provide an **Open Browser** action (replacing the old "Start" button) that opens the selected dev server's localhost URL in the user's external browser. If the selected server is not running, the action SHALL start it and then open its URL when ready; VortSpec SHALL NOT embed the preview in an iframe.

#### Scenario: Open a running server in the browser
- **WHEN** the selected dev server is running and the user clicks Open Browser
- **THEN** its localhost URL opens in the external browser (not embedded in the app)

#### Scenario: Open Browser starts a stopped server
- **WHEN** the selected dev server is not running and the user clicks Open Browser
- **THEN** VortSpec starts that server and opens its localhost URL externally once it is ready, surfacing errors as a human message

### Requirement: Expandable local-environment details
The collapse/expand arrow SHALL toggle a details section on the preview bar that reveals the local environment being triggered: the **localhost address** (URL) and related information — the server state (running / starting / stopped), the script/command, and the port. The details SHALL be **collapsed by default** and SHALL expand/collapse on clicking the arrow, keeping the same dark background.

#### Scenario: Expand to see environment details
- **WHEN** the user clicks the expand arrow on the collapsed preview bar
- **THEN** the bar expands to show the localhost address and the server state, script, and port for the selected target

#### Scenario: Collapse hides the details again
- **WHEN** the details are expanded and the user clicks the arrow again
- **THEN** the bar returns to the single-row collapsed state

