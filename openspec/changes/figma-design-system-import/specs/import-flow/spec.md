## MODIFIED Requirements

### Requirement: Figma connection option
The import screen SHALL provide a "Connect Figma" card alongside the ZIP card. The card SHALL have a title "Connect Figma" and subtitle "Import published components and variables from a Figma file". It SHALL contain a URL input field for pasting a Figma file URL, and a "Start Figma Import" button that activates when a valid Figma URL is detected.

#### Scenario: User pastes Figma URL
- **WHEN** user pastes a valid Figma file URL in the input field
- **THEN** the "Start Figma Import" button SHALL become enabled
- **AND** clicking it SHALL create a source record and start the Figma import flow

#### Scenario: Invalid Figma URL
- **WHEN** user pastes a non-Figma URL
- **THEN** the input SHALL show a validation error: "Please paste a valid Figma file URL"
