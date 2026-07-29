# enterprise-design-system-intake Specification

## Purpose
TBD - created by archiving change connect-enterprise-design-system. Update Purpose after archive.
## Requirements
### Requirement: Enterprise intake path
The setup stepper MUST offer a "Connect Enterprise Design System" option that sets `design_source: enterprise`, for a client whose design system, component library, Storybook, and knowledge base already exist and are to be consumed, not rebuilt.

#### Scenario: Selecting the enterprise path
- **WHEN** the user picks "Connect Enterprise Design System" in intake and completes setup
- **THEN** the project's `.sdd-de/project.yaml` records `design_source: enterprise` and the connect settings (Storybook source, optional repo, knowledge-base source, optional read-only Figma file)

#### Scenario: Enterprise path is distinct from extract/build sources
- **WHEN** a project is `design_source: enterprise`
- **THEN** the Foundation MUST NOT run Figma extraction, the 7-step component build, or a `/provision-library` run, and MUST NOT install VortSpec's own Storybook

### Requirement: Consume, never copy
For an enterprise project, VortSpec MUST reference the client's real assets as an index and MUST NOT regenerate or copy their tokens or components into VortSpec-owned definitions.

#### Scenario: Component and token index point at real assets
- **WHEN** the enterprise Foundation completes
- **THEN** `components.json` records each component's real import path/export plus its Storybook story id, and `token_file` in `project.yaml` points at the client's real token file when one is connected — never a competing VortSpec-authored definition

### Requirement: Generate code imports the client's real components
When compiling a composed screen for an enterprise project, VortSpec MUST import the client's real components and reference their real tokens, and MUST NOT rebuild look-alike components or emit a hardcoded value for a design value.

#### Scenario: Compile reuses the real library
- **WHEN** the user runs "Generate code" on a screen and the client's components are importable
- **THEN** the generated code imports those components (from their component dir or published package) and every color/spacing/radius/type value references one of the client's tokens

#### Scenario: Only the Storybook is connected (no importable source)
- **WHEN** the client's components cannot be imported (a URL-only Storybook, no repo/package)
- **THEN** compile is gated per component on the real component being importable, VortSpec names the components still "catching up", and generates token-referenced components from the harvested contract rather than hardcoding values

