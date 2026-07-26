## ADDED Requirements

### Requirement: Derived lite manifest (`designer.md`)

The system SHALL produce a lite design manifest, `designer.md`, as a projection derived from `DESIGN.md` and the contract. It SHALL be regenerated from those sources and SHALL NOT be hand-forked. `designer.md` SHALL be the only design context exposed to the light-authoring agent, and SHALL exclude framework/Storybook pointers (JSX imports, `.variants.ts` paths, `localhost:6006` URLs, `@/…` import paths).

#### Scenario: Manifest excludes framework pointers

- **WHEN** `designer.md` is generated from `DESIGN.md`
- **THEN** it contains no JSX imports, variant-file paths, Storybook URLs, or module import paths
- **AND** the light-authoring agent is given `designer.md` rather than `DESIGN.md`

#### Scenario: Manifest is regenerated, not edited

- **WHEN** `DESIGN.md` or the contract changes
- **THEN** `designer.md` is regenerated to match
- **AND** any prior manual edits to `designer.md` are not preserved as authoritative

### Requirement: Dual-keyed tokens (name + resolved value)

Every token reference in `designer.md` SHALL carry both the token name and its resolved value, so that light HTML renders standalone without a framework token runtime, token discipline holds by construction, and compile-back can restore the token reference without inventing tokens.

#### Scenario: Token appears with name and value

- **WHEN** a component or foundation in `designer.md` uses a token
- **THEN** the manifest records the token name (e.g. `color/brand/primary`) and its resolved value (e.g. `#c53434`)

#### Scenario: Light render uses the value, compile uses the name

- **WHEN** the palette renders a component from `designer.md`
- **THEN** it styles using the resolved value with no framework dependency
- **AND WHEN** that usage is later compiled to framework code, the token name is restored as the framework token reference

### Requirement: Component stand-ins

`designer.md` SHALL carry a framework-free HTML/CSS stand-in for each component, keyed by component name and variant, sufficient for the palette to render it without the framework.

#### Scenario: Stand-in renders without the framework

- **WHEN** the palette displays a component that has no framework implementation yet
- **THEN** it renders the component's stand-in from `designer.md`
- **AND** the stand-in reflects the contract's variants and token-derived styling

### Requirement: Derivable coverage and the structure gap

The manifest generator SHALL source token values, the token→css-property mapping, variants, sizes, and states from existing artifacts (resolved token values; the Component Spec "Design Tokens Used" table; the component metadata; `components.json`). The one field the toolkit does not capture — a component's framework-free HTML structure — SHALL be supplied by the harvest capability when a framework component exists, and by a fast Figma-derived placeholder before then.

#### Scenario: Derivable fields come from existing artifacts

- **WHEN** `designer.md` is generated
- **THEN** token values, token→property maps, variants, sizes, and states are taken from the contract/specs/metadata without re-deriving them

#### Scenario: Structure comes from harvest or placeholder

- **WHEN** a component has a framework implementation
- **THEN** its stand-in structure is the harvested real render
- **AND WHEN** it does not, its stand-in structure is a fast Figma-derived placeholder marked as such
