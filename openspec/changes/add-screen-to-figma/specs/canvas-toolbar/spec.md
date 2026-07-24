## ADDED Requirements

### Requirement: Send to Figma control
The bottom canvas toolbar SHALL present a "Send to Figma" control (a Figma-logo icon button) alongside the existing mode and viewport controls. The control SHALL be enabled only when Figma is connected (via `figma-cli` or the user's Figma MCP) and SHALL surface its in-place status — idle, sending, sent, or failed — without leaving the Playground. The existing mode (Interact/Inspect/Comment/Insert) and viewport controls SHALL be unchanged.

#### Scenario: The control is present on the toolbar
- **WHEN** the Playground canvas is shown
- **THEN** the bottom toolbar SHALL include a Figma-logo "Send to Figma" button after the viewport control

#### Scenario: Disabled when Figma is not connected
- **WHEN** neither `figma-cli` nor the user's Figma MCP is connected
- **THEN** the "Send to Figma" button SHALL be disabled with a tooltip indicating Figma must be connected

#### Scenario: In-place status while sending
- **WHEN** a send is in progress
- **THEN** the toolbar SHALL indicate the sending state (e.g. a spinner/label) and reflect success or failure when it completes
- **AND** the user SHALL NOT be required to leave the Playground to see the status
