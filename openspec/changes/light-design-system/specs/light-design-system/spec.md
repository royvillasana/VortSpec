## ADDED Requirements

### Requirement: Lightweight component palette generated from the contract

The system SHALL generate a lightweight, browsable component palette ("the design system") from the Figma-sourced contract (`components.json` + specs) using a fast, low-cost agent, producing framework-free HTML/CSS/JS for each component in the inventory. The palette SHALL be produced without requiring any framework component to exist yet, and SHALL NOT call Figma directly — it consumes only the already-extracted contract.

#### Scenario: Palette is generated before framework components exist

- **WHEN** `extract-design-system` has produced the contract but no framework component has been built
- **THEN** the system generates a light HTML/CSS/JS shelf entry for every component in the contract
- **AND** each entry is styled from the contract's resolved token values, requiring no framework runtime to render

#### Scenario: Generation does not access Figma directly

- **WHEN** the palette generator runs
- **THEN** it reads only the contract artifacts (`components.json`, specs, `DESIGN.md`/`designer.md`)
- **AND** it makes no direct Figma API call (Figma is reached only via the user's read-only Figma MCP during extraction)

### Requirement: Visual-reference section

The palette SHALL include a visual-reference section that displays the design system's foundations captured from the Figma file — the components, the spacing scale, margins, padding, and the tokens in use — each shown with its resolved value.

#### Scenario: Foundations are browsable with resolved values

- **WHEN** a user opens the design-system view
- **THEN** the system shows the component shelf plus foundation panels for spacing, margins, padding, and tokens
- **AND** each foundation entry displays both the token name and its resolved value

### Requirement: Palette is the Playground authoring surface

The palette SHALL serve as the component source a user composes pages against in the Playground, independent of whether the corresponding framework components exist.

#### Scenario: Composing against a palette component

- **WHEN** a user drags a palette component onto a Playground page
- **THEN** the page references that component by its contract identity (name + variant)
- **AND** the reference remains valid whether the component is `light-only` or `framework-ready`

### Requirement: Palette is a derived projection, never a competing source of truth

The palette SHALL be a derived artifact regenerated from the contract and `designer.md`; it SHALL NOT be a hand-edited source that can diverge from the contract, and it SHALL NOT replace real Storybook.

#### Scenario: Regeneration overwrites drift

- **WHEN** the contract or `designer.md` changes and the palette is regenerated
- **THEN** the regenerated palette reflects the current contract
- **AND** no hand-authored palette edits are treated as authoritative over the contract

#### Scenario: Real Storybook is preserved

- **WHEN** the palette exists for framework-agnostic authoring
- **THEN** real Storybook is still generated for the framework components
- **AND** the palette is presented as a Playground surface, not as a Storybook substitute
