## ADDED Requirements

### Requirement: LLM-assisted component detection
Stage 4 SHALL use the LLM to analyze HTML pages and identify real, reusable UI components. The LLM SHALL distinguish meaningful components (navigation bars, cards, buttons, forms) from structural noise (generic div wrappers).

#### Scenario: Navigation bar detected
- **WHEN** HTML contains a `<header>` or `<nav>` with links
- **THEN** the LLM SHALL identify it as a "Navigation Bar" component
- **AND** note its occurrences across pages

#### Scenario: Repeated card pattern detected
- **WHEN** HTML contains multiple elements with similar structure and different content
- **THEN** the LLM SHALL identify it as a card/tile component with props

### Requirement: Meaningful component naming
The LLM SHALL name components using clear, design-system-appropriate names: "Primary Button", "Module Card", "Navigation Bar", "Hero Section", "Footer". NOT "component-candidate-4" or "div-wrapper-12".

#### Scenario: Components get readable names
- **WHEN** the LLM detects components
- **THEN** each SHALL have a human-readable name based on its visual/functional role

### Requirement: Prop and variant inference
The LLM SHALL identify component props (label text, icon, color) and variant axes (primary/secondary, sm/md/lg) from the HTML context.

#### Scenario: Button variants detected
- **WHEN** HTML contains buttons with different styles but similar structure
- **THEN** the LLM SHALL identify variant axes (e.g. "style: primary, secondary, ghost")

### Requirement: Deterministic fallback
If the LLM call fails or no API key is configured, the system SHALL fall back to the deterministic structure inference algorithm.

#### Scenario: No API key configured
- **WHEN** `OPENROUTER_API_KEY` is not set
- **THEN** the pipeline SHALL use deterministic detection and log a warning

### Requirement: Quality over quantity
The LLM SHALL aim for 5-15 high-quality component detections per import, not 60+ structural fragments. Each detected component SHALL be a genuinely reusable UI element.

#### Scenario: Noise filtered
- **WHEN** HTML contains 200 div elements
- **THEN** the LLM SHALL NOT create 200 components
- **AND** SHALL identify only the meaningful, reusable patterns
