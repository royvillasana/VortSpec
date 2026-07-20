## ADDED Requirements

### Requirement: Build from the component's Figma reference, not its name

When a component has a Figma design reference, the system's build/spec-generation SHALL provide that reference (variant structure, the tokens each variant uses, and a screenshot) to the agent and instruct it to reproduce the referenced design. The build SHALL NOT rely on the component's name alone to infer its shape.

#### Scenario: The alert is built to look like the referenced alert

- **WHEN** the "alert" component is built and its Figma page shows an alert with an icon slot, message, and severity variants
- **THEN** the build prompt carries that structure and screenshot, and the produced component reproduces those parts rather than resembling an unrelated component such as a button

#### Scenario: Variant set is one component covering all reference variants

- **WHEN** the reference page contains multiple variant frames of one component
- **THEN** the build produces a single component whose variant props cover all referenced variants (consistent with the collapsed-variant-set rule)

### Requirement: Do not fabricate a design when no reference exists

When a component has no Figma reference, the build SHALL NOT silently invent a design from the name. It SHALL either skip the component as unbuildable-without-reference or clearly mark the output as unreferenced so it is not later reported as design-matching.

#### Scenario: Unreferenced component is not passed off as design-matching

- **WHEN** a roster component has no mapped Figma page and is built anyway
- **THEN** the system records that the component was built without a design reference, and the validation gate cannot report it as a visual match

### Requirement: Index-grounding must not override the design reference

When the build is grounded with the design-system index, the component's own Figma reference SHALL take precedence for that component's shape, so grounding does not bias the agent into copying an existing similar component (e.g. building every control to look like "button").

#### Scenario: Reference wins over a similar indexed component

- **WHEN** the index already contains a "button" and the build target is "alert" with its own reference
- **THEN** the agent follows the alert reference for structure rather than mirroring the indexed button
