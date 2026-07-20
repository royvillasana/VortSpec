## ADDED Requirements

### Requirement: Page-per-component authoring convention

The system SHALL treat a Figma page whose name matches a roster component as the authoritative design reference for that component, containing that component and all of its variations (e.g. a page named "accordion" holds the accordion and its variant frames). The methodology docs SHALL state this convention so authors know a page is one component, not a mixed canvas.

#### Scenario: A component page is recognized as its reference

- **WHEN** the Figma file contains a page named "accordion" holding accordion variant frames
- **THEN** the system associates that page with the roster component "accordion" as its authoritative reference

#### Scenario: Non-component pages are ignored as references

- **WHEN** the Figma file contains utility pages (e.g. "Cover", "Typography", "Icons") that do not name a roster component
- **THEN** the system does not treat those pages as component references and does not attempt to build a component from them

### Requirement: Map roster components to their Figma reference

The system SHALL build a durable mapping from each roster component to its Figma component page (and the node/frame set within it), so both the build and the validation can locate the same authoritative reference. When a roster component has no matching Figma page, the system SHALL record it as unmapped rather than guessing a page.

#### Scenario: Every named page maps to a roster entry

- **WHEN** discovery runs against a file with component pages "accordion", "alert", "button"
- **THEN** the mapping links each roster component to its page, resolvable by later build and validation steps

#### Scenario: Missing reference is surfaced, not fabricated

- **WHEN** a roster component has no Figma page bearing its name
- **THEN** the system marks the component as having no design reference and does not invent a node id or substitute another component's page

### Requirement: Retrieve per-component design and screenshot

For a mapped component, the system SHALL retrieve its design detail (structure, variant frames, and the tokens each variant uses) and a rendered screenshot of the reference, via the Figma bridge/MCP, for use as the build anchor and the validation target.

#### Scenario: Reference detail and image are available to downstream steps

- **WHEN** the build or validation step requests the reference for a mapped component
- **THEN** it receives the component's variant structure and a screenshot image of the Figma design

#### Scenario: Bridge unavailable degrades honestly

- **WHEN** the Figma bridge/MCP is unreachable at retrieval time
- **THEN** the system reports the reference as unavailable and blocks (rather than silently proceeding as if a reference had been compared)
