# design-system-workspace

## ADDED Requirements

### Requirement: Rich per-component Storybook docs
The app SHALL generate rich per-component documentation pages in Storybook that
match the reference component-doc structure, additively.

#### Scenario: Sync docs generates missing pages
- **WHEN** the user runs "Sync docs"
- **THEN** shared doc blocks are created once, and a `<Component>.mdx` docs page is
  generated for each component that lacks one, in the section order: live preview,
  Component Identity, Props, Common Patterns, Anti-Patterns, States & Behaviour,
  Accessibility, Design Tokens, AI Generation Hints, Stories

#### Scenario: Additive and non-destructive
- **WHEN** some components already have a docs page
- **THEN** those are left untouched and only the missing ones are generated;
  component source and existing stories are never modified

#### Scenario: Figma metadata enrichment
- **WHEN** the project's design source is Figma
- **THEN** the docs data is enriched via `figma_generate_component_doc` (anatomy,
  per-variant tokens, content guidelines, annotations, parity); otherwise the docs
  are composed from the component specs + source only
