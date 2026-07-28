## ADDED Requirements

### Requirement: Code is generated in the user's selected framework

The "Generate code" action SHALL produce code in the framework the user selected during the
initial flow / setup (`.sdd-de/project.yaml` `framework` — e.g. React, Vue, Svelte, Angular),
NOT a framework hardcoded to React. Every generated page SHALL use that framework's conventions
and reuse/build the design-system components in it.

#### Scenario: Generation targets the configured framework
- **WHEN** the user runs "Generate code" and the project's configured framework is (e.g.) Vue
- **THEN** the generated screens are produced as Vue components/pages, not React
- **AND** if the configured framework is React, they are produced as React

### Requirement: Code is generated from the Flow, not the canvas

Generating framework code from the screens SHALL be an explicit action in the Flow (the
design-system workspace), NOT an action on the editing canvas. The canvas SHALL have no
"Convert to code" button; editing a screen never triggers a framework build.

#### Scenario: Generate lives in the Flow
- **WHEN** the user is ready to produce framework code and opens the Flow
- **THEN** a "Generate framework code" action is available there
- **AND** no equivalent button exists on the light-page editing canvas

#### Scenario: Editing never generates framework code
- **WHEN** the user edits a light page in the canvas
- **THEN** only the light page HTML is written; no React/framework code is generated as a side effect

### Requirement: Generate builds, audits, and validates the framework output

The "Generate framework code" action SHALL convert the light pages to framework code by
building/reusing the design-system components, then AUDIT and VALIDATE the result (an AI
review plus a visual validation against the light page). The light pages SHALL remain intact
as the editable source of truth.

#### Scenario: Generate produces validated framework pages
- **WHEN** the user runs "Generate framework code" for the light pages
- **THEN** each light page is converted to a real framework page that reuses/builds the design-system
  components, with every token-bound value referencing a design token
- **AND** the output is audited and visually validated against the light page before it is considered done

#### Scenario: The light pages are preserved
- **WHEN** framework code has been generated
- **THEN** the original `.vortspec/light-pages/*.html` files remain unchanged and continue to be the
  editable source in the canvas
