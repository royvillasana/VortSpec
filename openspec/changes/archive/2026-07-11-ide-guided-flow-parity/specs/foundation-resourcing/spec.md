## ADDED Requirements

### Requirement: The foundation can be re-run against an additional source

After a design system exists, the user SHALL be able to re-run the design-system foundation against an **additional source** (a second Figma file in v1; a zip/local folder of components as a fast-follow). The foundation SHALL default to the project's configured source and accept a new one for the re-run. This SHALL reuse the existing SDD-DE source-extract path with no change to the pipeline definitions.

#### Scenario: Point the foundation at a second source

- **WHEN** a project already has a design system and the user supplies a new Figma source to the foundation
- **THEN** the foundation SHALL be able to run against that new source

### Requirement: Re-running an existing foundation asks clean-sweep vs merge

When the project **already** has a foundation and the user triggers extraction, VortSpec SHALL ask whether to **Clean sweep** (re-extract and replace the current tokens + components) or **Merge** (additively add the new source's tokens + components into the existing system). The choice SHALL map to existing SDD-DE prompts — clean-sweep to the fresh source-extract prompt, merge to the additive re-scan/reconcile prompt — with VortSpec selecting the mode and passing the source, never re-implementing the extraction.

#### Scenario: Choice appears only when a foundation exists

- **WHEN** the user triggers extraction on a project that already has a foundation
- **THEN** a Clean-sweep vs Merge choice SHALL be presented before the run launches
- **AND WHEN** no foundation exists yet, extraction SHALL run directly without the choice

#### Scenario: Merge is additive and deduped by name

- **WHEN** the user chooses Merge for a new source
- **THEN** the new source's tokens and components SHALL be added to the existing system, deduped by name, keeping existing entries and adding new ones

#### Scenario: Name collisions are flagged, not overwritten

- **WHEN** a merged source contains a token or component whose name already exists with a different value
- **THEN** the collision SHALL be flagged for the user to review, and SHALL NOT be silently overwritten
