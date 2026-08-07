## MODIFIED Requirements

### Requirement: Rich per-component Storybook docs
The app SHALL generate rich per-component documentation pages in Storybook that
match the reference component-doc structure, additively. The docs pages SHALL be rendered **from**
the VortSpec-owned metadata record at `.vortspec/metadata/<name>.json` — Storybook is a reader of
that record and a human-validation surface, not its owner. Storybook SHALL NOT author a
per-component metadata module in the application's source tree, and the metadata record SHALL exist
and be complete whether or not Storybook is installed.

#### Scenario: Sync docs generates missing pages
- **WHEN** the user runs "Sync docs"
- **THEN** shared doc blocks are created once, and a `<Component>.mdx` docs page is
  generated for each component that lacks one, in the section order: live preview,
  Component Identity, Props, Common Patterns, Anti-Patterns, States & Behaviour,
  Accessibility, Design Tokens, AI Generation Hints, Stories
- **AND** every section is populated from the component's `.vortspec/metadata/<name>.json` record

#### Scenario: Additive and non-destructive
- **WHEN** some components already have a docs page
- **THEN** those are left untouched and only the missing ones are generated;
  component source and existing stories are never modified

#### Scenario: Figma metadata enrichment
- **WHEN** the project's design source is Figma
- **THEN** the docs data is enriched via `figma_generate_component_doc` (anatomy,
  per-variant tokens, content guidelines, annotations, parity); otherwise the docs
  are composed from the component specs + source only
- **AND** the enrichment is written into the metadata record, so the docs page and any grounded run
  read the same enriched data

#### Scenario: Metadata exists without Storybook
- **WHEN** a project has never installed Storybook
- **THEN** every component SHALL still have its metadata record
- **AND** grounded runs SHALL receive it

#### Scenario: No metadata module is written to source
- **WHEN** docs are synced for a component
- **THEN** no `<Component>.metadata.*` module SHALL be created or modified under the project's
  component directory
