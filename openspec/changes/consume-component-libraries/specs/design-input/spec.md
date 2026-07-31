## ADDED Requirements

### Requirement: Component-library sources yield a consume outcome
Selecting a component library at setup SHALL result in the library's real components becoming consumable — source copied into `component_dir` for cli-registry libraries, or the package installed and importable for installed-package/headless libraries — parallel to how the Figma, ZIP, and GitHub sources land their source of truth. The design-source contract SHALL NOT treat a selected library as merely a written reference to rebuild from.

#### Scenario: Library selected as design source
- **WHEN** the user completes setup with a component library as the design source and provisions it
- **THEN** the library's real components are present (copied or installed) and are the source of truth the pipeline reads, rather than an empty `component_dir` that triggers a from-scratch rebuild

#### Scenario: Supersedes provisioning-only handling
- **WHEN** this capability is applied
- **THEN** it absorbs the in-flight `provision-library-source` behavior and additionally covers readiness, no-rebuild enforcement, Storybook handling, and DESIGN.md for consume sources
