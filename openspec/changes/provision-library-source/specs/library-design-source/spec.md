## ADDED Requirements

### Requirement: Classify each library as copy-source or package

The system SHALL classify every supported component library as one of two provisioning kinds, because they are provisioned in fundamentally different ways: **copy-source** libraries whose CLI copies component source files into the repo (`shadcn`, `radix`), and **package** libraries whose components are imported from an installed npm package (`mui`, `chakra`, `antd`, `mantine`, `headlessui`). The kind SHALL be recorded in project config alongside `component_library`.

#### Scenario: shadcn classified as copy-source
- **WHEN** the user selects `shadcn/ui` as the component library
- **THEN** the resolved provisioning kind SHALL be `copy-source`
- **AND** the config records both `component_library: shadcn` and its provisioning kind

#### Scenario: MUI classified as package
- **WHEN** the user selects `Material UI` as the component library
- **THEN** the resolved provisioning kind SHALL be `package`

#### Scenario: Other / unknown library
- **WHEN** the user selects `Other` (a library the system does not recognize)
- **THEN** the system SHALL ask which provisioning kind applies rather than guess, and record the answer

### Requirement: Provision copy-source libraries via their real CLI

For a copy-source library the system SHALL provision the design system by running the library's own CLI through the user's local toolchain (e.g. `npx shadcn@latest init` then `add`), so the **real component source files** land in the configured `component_dir`. The system SHALL NOT reimplement these components from scratch.

#### Scenario: shadcn components pulled in, not rebuilt
- **WHEN** a project's design source is a copy-source library and provisioning runs
- **THEN** the library CLI writes its actual component source files into `component_dir`
- **AND** those files — not hand-authored look-alikes — become the design system the pipeline reads
- **AND** no from-scratch reimplementation of a provided component is generated

#### Scenario: CLI runs through the user's environment
- **WHEN** the provisioning step invokes a library CLI
- **THEN** it SHALL use the user's local package manager/toolchain (the same way the app runs figma-cli and Claude), and SHALL NOT vendor, bundle, or proxy the library itself

#### Scenario: Provisioning is idempotent and resumable
- **WHEN** provisioning is re-run on a project that already has some library components
- **THEN** already-present components SHALL be left intact (or updated in place) rather than duplicated, and the step reports what it added

### Requirement: Provision package libraries via install + token-mapped wrappers

For a package library the system SHALL install the library package and generate thin **wrapper components** in `component_dir` that re-export or compose the library's primitives and map the project's design tokens onto them. The wrappers SHALL NOT reimplement the library's behavior.

#### Scenario: Package installed and wrapped
- **WHEN** a project's design source is a package library and provisioning runs
- **THEN** the library package is installed into the project
- **AND** a wrapper component per requested primitive is generated in `component_dir` that imports from the library and applies the project's tokens
- **AND** the wrapper delegates behavior to the library rather than re-creating it

#### Scenario: Wrapper references tokens, not hardcoded values
- **WHEN** a wrapper component is generated for a package library
- **THEN** every color/spacing/radius/typography value it sets SHALL reference a design token, consistent with the toolkit's token-referenced output rule

### Requirement: Extraction reads provisioned files instead of rebuilding

After provisioning, the SDD-DE extraction/detection step SHALL treat the provisioned files in `component_dir` as the component inventory (its existing non-Figma behavior), producing `components.json` from real files rather than triggering a from-scratch build cycle.

#### Scenario: Inventory built from provisioned components
- **WHEN** extraction runs for a `design_source: library` project after provisioning
- **THEN** it reads the provisioned component files directly and writes `components.json`
- **AND** it does not enumerate a Figma file or invent components that were not provisioned

#### Scenario: Provisioning is a prerequisite for the library flow
- **WHEN** the guided flow reaches component work for a `design_source: library` project whose components have not been provisioned
- **THEN** the flow SHALL prompt to provision the library first rather than proceeding to build components from scratch

### Requirement: Library-flow specs adapt a real base component

For a `design_source: library` project the `generate-artifacts` step SHALL produce a component spec that documents the **customization/wrapping of a named, provisioned base component**, not a from-scratch reconstruction of it.

#### Scenario: Spec names the real base component
- **WHEN** a component spec is generated for a library-sourced component
- **THEN** it records the provisioned base component it adapts and only the overrides/props/tokens to apply
- **AND** the implementation task list is scoped to customization, not reimplementation
