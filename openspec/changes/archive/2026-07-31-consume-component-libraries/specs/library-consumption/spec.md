## ADDED Requirements

### Requirement: Consume component libraries by type
When the design source is a component library, VortSpec SHALL consume the library's real components according to its type, and SHALL NOT reimplement components the library already ships. The recognized types are: **cli-registry** (the library's CLI copies real source into the repo), **installed-package** (components imported from an installed package), and **headless** (installed primitives with no visual/token layer).

#### Scenario: CLI-registry library (shadcn-style)
- **WHEN** a project's library kind is cli-registry and the user provisions it
- **THEN** VortSpec runs the library's real CLI non-interactively (e.g. `npx shadcn@latest add --yes <items>`), the real component source lands in `component_dir`, and no from-scratch reimplementation is performed

#### Scenario: Installed-package library (MUI/Chakra/Astryx-style)
- **WHEN** a project's library kind is installed-package and the user provisions it
- **THEN** VortSpec installs the package via the user's toolchain and consumes components by importing them from the package specifier — copying no source and reimplementing no component

#### Scenario: Headless library (Radix-style)
- **WHEN** a project's library kind is headless
- **THEN** VortSpec installs and imports the primitives and records that the library carries no token model, requiring the project's own tokens for styling

### Requirement: Consumed components are never rebuilt
For a consume source, VortSpec SHALL NOT push the library's components through the from-scratch build cycle, neither automatically nor via the manual build affordances.

#### Scenario: Auto-build excludes consume sources
- **WHEN** the automatic component build evaluates a project whose source is a consume source
- **THEN** it claims and stops without building any component (as it already does for enterprise), so consumed components are never regenerated as look-alikes

#### Scenario: Manual build is unavailable for consumed components
- **WHEN** the user views the component roster of a consume-source project
- **THEN** the roster offers a consume/provision affordance rather than a from-scratch "build" for components the library ships

### Requirement: Pointer-shaped inventory for consume sources
For a consume source, `.sdd-de/components.json` entries SHALL carry a resolvable pointer to the real component (an import path + export name, and optionally a story/docs id + tier) rather than a rebuild-oriented descriptor.

#### Scenario: Composing from pointers
- **WHEN** the AI composes a screen from a consume-source project's inventory
- **THEN** each component entry resolves to a real `import` and usage of the library's component, not a locally reproduced approximation

### Requirement: Real props and variants ground the AI
For a consume source, VortSpec SHALL enumerate each consumed component's real props and variants — from copied CVA variant maps (cli-registry), from the package's type declarations or the vendor's docs/MCP (installed-package/headless) — and expose them for AI grounding.

#### Scenario: Prop enumeration without a rebuilt Storybook
- **WHEN** a consume-source component's props/variants are needed to compose accurately
- **THEN** they are read from the library's real source (variant maps / `.d.ts` / vendor docs), without building a VortSpec Storybook

### Requirement: CSS-in-JS styling is not a component source
VortSpec SHALL treat CSS-in-JS libraries (Emotion, styled-components) as a `styling` strategy, and SHALL NOT offer them as a component library to consume.

#### Scenario: Emotion is a styling choice
- **WHEN** a project uses Emotion or styled-components and declares no component library
- **THEN** VortSpec records it as the styling approach and does not present a "consume this library" component flow for it

### Requirement: Intake detects the library kind
At intake, VortSpec SHALL inspect the target project to suggest the library kind: a root `components.json` implies cli-registry; a UI component package in dependencies implies installed-package or headless; only a CSS-in-JS dependency implies a styling strategy with no component source.

#### Scenario: Detecting a shadcn project
- **WHEN** the target repo contains a root `components.json`
- **THEN** intake suggests the cli-registry kind and the corresponding consume commands

#### Scenario: Detecting an installed-package project
- **WHEN** the target repo lists a known UI component package (e.g. `@mui/material`, `@chakra-ui/react`, `@astryxdesign/core`) in its dependencies
- **THEN** intake suggests the installed-package (or headless) kind and consumes via import rather than copy

### Requirement: Astryx (Meta) is a supported installed-package library
VortSpec SHALL offer Astryx as a selectable component library, classified as installed-package, consumed by installing its package and importing its components; the exact CLI/MCP commands, token source, and versions SHALL be resolved at intake (via the library's CLI/MCP or user confirmation) rather than hard-coded.

#### Scenario: Selecting Astryx at setup
- **WHEN** the user selects Astryx as the design source
- **THEN** VortSpec records it as an installed-package library and consumes its components by import, resolving the concrete install/enumeration commands at intake without reimplementing any Astryx component
