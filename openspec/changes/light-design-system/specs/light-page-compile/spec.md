## ADDED Requirements

### Requirement: Deterministic compile of a light-authored page

The system SHALL compile a page authored on the light surface into real framework code deterministically, using the shared identity carried by the light artifacts (token names and component names / `data-component` markers) rather than re-inferring intent.

#### Scenario: A light page compiles to framework code

- **WHEN** a user compiles a page composed on the light surface
- **THEN** the system emits framework code for the user's configured framework
- **AND** the emitted code composes the real components used on the page

### Requirement: Token restoration

Compilation SHALL restore each embedded resolved token value back to the framework's token reference using the token name recorded alongside it in `designer.md`; it SHALL NOT create new tokens.

#### Scenario: Value restored to token reference

- **WHEN** a light element is styled with an embedded value (e.g. `#c53434`) carrying its token name (`color/brand/primary`)
- **THEN** the compiled code references the framework token (e.g. `var(--color-brand-primary)` / the CVA class) rather than the literal value

#### Scenario: No token invention

- **WHEN** compilation encounters a styled value
- **THEN** it maps to an existing token by the recorded name
- **AND** it does not define a new token

### Requirement: Component mapping via identity

Compilation SHALL map each light component usage to the real CVA component of the same contract identity (name + variant), reusing the existing compose-run flow and `data-component` marker convention and the framework-free node-tree projection / reconciler.

#### Scenario: Light component maps to real component

- **WHEN** the page uses a light `Button` (variant `primary`)
- **THEN** the compiled code uses the real `Button` component with `variant="primary"`

#### Scenario: Compile blocked for not-yet-ready components

- **WHEN** a used component is still `light-only`
- **THEN** compilation reports that component as blocking and names it
- **AND** compilation does not fabricate a framework component for it

### Requirement: Token discipline preserved end to end

The compiled output SHALL contain no hardcoded design-system values that bypass tokens; every color, spacing, radius, and typography value that maps to a token SHALL be emitted as a token reference.

#### Scenario: No hardcoded values leak into compiled output

- **WHEN** a page is compiled
- **THEN** design-system values in the output reference design tokens
- **AND** no raw hex/px that corresponds to a known token appears in the emitted code
