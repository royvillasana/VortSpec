## ADDED Requirements

### Requirement: One shared contract for both tracks

The system SHALL treat the `extract-design-system` output (`components.json` + specs: name, tier, variants, props, token bindings) as the single shared contract that both the light track and the framework track build to. Figma SHALL be read only once, during extraction, via the user's read-only Figma MCP.

#### Scenario: Both tracks consume the same contract identity

- **WHEN** the light track and the framework track build a given component
- **THEN** both use the same name, variants, and props from the contract
- **AND** neither independently re-reads Figma to derive its own component identity

### Requirement: Two-track parallel build

The system SHALL run a fast/low-cost light track (contract → light palette shelf) and a background careful track (contract → real framework components via the existing 7-step cycle) concurrently.

#### Scenario: Light shelf is available before the framework library

- **WHEN** extraction completes
- **THEN** the light track produces a usable shelf while the framework track is still building
- **AND** the user can begin composing pages against the shelf immediately

### Requirement: Per-component readiness state

Each component SHALL carry a readiness state of `light-only` or `framework-ready`. A component becomes `framework-ready` when its framework implementation exists (and, per existing rules, its stand-in has been harvested from the real render).

#### Scenario: Readiness transitions on framework completion

- **WHEN** the framework track finishes a component
- **THEN** that component's readiness flips from `light-only` to `framework-ready`
- **AND** the Playground reflects the new state

#### Scenario: Playground surfaces catching-up components

- **WHEN** a user browses the design system
- **THEN** components still being built by the framework track are visibly marked `light-only`

### Requirement: Convergence guarantee

Because both tracks build to the shared contract, component identity SHALL converge by construction; only visual fidelity is eventually-consistent and SHALL be reconciled by harvesting the stand-in from the real render once the framework component exists.

#### Scenario: Identity never diverges

- **WHEN** a page authored against a `light-only` component is later compiled
- **THEN** the component reference resolves to the framework component of the same name and variant

#### Scenario: Visual is reconciled by harvest

- **WHEN** a component becomes `framework-ready`
- **THEN** its palette stand-in is replaced by the harvested real render, closing any visual gap

### Requirement: Soft, per-component Screen Creation gate

The system SHALL replace the hard "all components before any screen" prerequisite with a soft, per-component gate: composition against `light-only` components is allowed, and compiling a page to shippable framework code SHALL be gated per component on that component being `framework-ready`.

#### Scenario: Compose freely, compile when ready

- **WHEN** a user composes a page using components not yet `framework-ready`
- **THEN** composition is permitted
- **AND** compiling that page to framework code is blocked only for the components that are still `light-only`, with those components named

#### Scenario: Fully-ready page compiles

- **WHEN** every component used on a page is `framework-ready`
- **THEN** the page can be compiled to framework code with no readiness block
