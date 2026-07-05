## ADDED Requirements

### Requirement: Project framework selection
Before code generation, the user SHALL select a target framework for the project. Options: React, Next.js, Vue, Svelte. This is stored on the project and applies to all components.

#### Scenario: User selects React
- **WHEN** user chooses "React" as the framework
- **THEN** all generated components SHALL use React JSX/TSX syntax

### Requirement: Project style library selection
The user SHALL select a CSS approach. Options: Tailwind CSS, CSS Modules, styled-components. Generated code SHALL use the selected approach for all styling.

#### Scenario: User selects Tailwind
- **WHEN** user chooses "Tailwind CSS"
- **THEN** generated components SHALL use Tailwind utility classes referencing design tokens

### Requirement: Project component library selection
The user SHALL optionally select a base component library. Options: shadcn/ui, Radix, Headless UI, none. When selected, generated code SHALL use primitives from that library.

#### Scenario: User selects shadcn/ui
- **WHEN** user chooses "shadcn/ui"
- **THEN** generated components SHALL import from shadcn/ui primitives where applicable

### Requirement: Configuration persistence
Project configuration SHALL be stored in the `projects` table and applied to all code generation for that project.

#### Scenario: Config saved and reused
- **WHEN** user saves project configuration
- **THEN** subsequent code generation SHALL use the saved framework, style library, and component library

### Requirement: Configuration prompt on first generation
If no framework is configured when user clicks "Generate Code", the system SHALL prompt for configuration before proceeding.

#### Scenario: First-time generation without config
- **WHEN** user clicks "Generate Code" and no framework is set
- **THEN** a setup dialog SHALL appear asking for framework, style library, and component library
