## ADDED Requirements

### Requirement: LLM-powered component code generation
The system SHALL generate production-quality component code from ComponentIR using the LLM (OpenRouter). The generated code SHALL use the project's selected framework and style library, and SHALL reference design tokens by name.

#### Scenario: Generate a React + Tailwind Button
- **WHEN** user clicks "Generate Code" on a Button component with framework=React, style=Tailwind
- **THEN** the LLM SHALL produce a `Button.tsx` file using React + Tailwind classes
- **AND** the code SHALL reference design tokens as Tailwind classes (e.g. `bg-primary-500`)
- **AND** the code SHALL include all variant props from the ComponentIR

#### Scenario: Generated code includes all variants
- **WHEN** a component has variant axes [intent: primary/secondary/ghost, size: sm/md/lg]
- **THEN** the generated code SHALL accept `intent` and `size` props
- **AND** SHALL render differently based on the variant combination

### Requirement: Storybook story generation
For each generated component, the system SHALL also generate a Storybook story file showing all variant combinations.

#### Scenario: Story with variant controls
- **WHEN** code is generated for a Button with 3 intents × 3 sizes
- **THEN** a `Button.stories.tsx` SHALL be generated with Storybook controls for each variant axis

### Requirement: Design token CSS generation
The system SHALL generate a CSS file with custom properties mapping token names to resolved values.

#### Scenario: Token CSS generated
- **WHEN** a component references tokens color/primary/500 and radius/md
- **THEN** a CSS file SHALL be generated with `--color-primary-500: #2563EB; --radius-md: 8px;`

### Requirement: Code stored in database
Generated code SHALL be stored in the `code_artifacts` table with: component_code, story_code, types_code, token_css, framework, llm_model.

#### Scenario: Artifacts persisted
- **WHEN** code generation completes
- **THEN** all code artifacts SHALL be stored in the database linked to the component

### Requirement: Deterministic fallback
If the LLM fails, the system SHALL fall back to template-based codegen that produces a basic component skeleton from the IR structure.

#### Scenario: LLM fails, fallback used
- **WHEN** the LLM call fails after retry
- **THEN** a template-based component SHALL be generated with correct props and basic structure

### Requirement: Regeneration
The user SHALL be able to regenerate code for a component after making changes (editing tokens, variants, or props).

#### Scenario: Regenerate after token edit
- **WHEN** user edits a design token value and clicks "Regenerate"
- **THEN** new code SHALL be generated reflecting the updated token value
