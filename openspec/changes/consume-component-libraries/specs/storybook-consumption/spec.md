## ADDED Requirements

### Requirement: Skip a VortSpec-built Storybook for consume-source libraries
For any consume-source component library (not only enterprise), VortSpec SHALL NOT install or build its own Storybook to view the library. `/storybook` SHALL NOT be a prerequisite for composing screens against a consumed library.

#### Scenario: No VortSpec Storybook for a consumed library
- **WHEN** a project consumes a component library (cli-registry / installed-package / headless)
- **THEN** VortSpec does not run the Storybook install/build for that project, and screen composition is not gated on a locally built Storybook

### Requirement: Display the library's own design system instead
For a consume-source library, the design-system surface SHALL display the library via VortSpec's palette screen (tokens + pointer inventory + stand-ins) and/or the library's own hosted Storybook/docs embedded as-is, without reproducing the library in a VortSpec-built Storybook.

#### Scenario: Palette screen as the default display
- **WHEN** the user opens the design-system surface of a consume-source project
- **THEN** the palette screen shows the consumed components and tokens, read from the pointer inventory and token source, with no dependency on a built Storybook

#### Scenario: Embedding the vendor's own Storybook
- **WHEN** the consumed library ships its own hosted Storybook/docs and a URL is configured
- **THEN** the Storybook section embeds that vendor URL as-is (generalizing the enterprise embed) rather than serving a VortSpec-built Storybook
