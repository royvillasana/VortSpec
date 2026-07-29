# storybook-consumption Specification

## Purpose
TBD - created by archiving change connect-enterprise-design-system. Update Purpose after archive.
## Requirements
### Requirement: Embed the client's Storybook as-is
For an enterprise project, the Storybook section MUST load the client's own Storybook (a hosted URL, a local dev URL, or a served static build), and MUST NOT install or serve a VortSpec-built Storybook.

#### Scenario: Browsing the client's Storybook
- **WHEN** the user opens the Storybook section of an enterprise project
- **THEN** the embedded Storybook view is pointed at the client's Storybook source and shows their components as they authored them

### Requirement: Storybook is the single consumption source
The client's Storybook MUST be the single source for both the embedded Storybook section and the light-stand-in snapshot, so that refreshing the snapshot re-reads the same source the section displays.

#### Scenario: One connection, two consumers
- **WHEN** the enterprise Storybook source is set
- **THEN** both the embedded section and the snapshot read from it, and an "Update snapshot" refresh reads that same source

### Requirement: Snapshot the light stand-in layer once
VortSpec MUST create the framework-free light stand-ins for the Playground by snapshotting the client's Storybook renders once at setup, capturing each story's rendered DOM and resolved computed styles as inline-styled framework-free HTML grouped by component.

#### Scenario: Initial snapshot at setup
- **WHEN** the enterprise Foundation runs
- **THEN** each component's stories are rendered and harvested into `.vortspec/light-html/` stand-ins (per variant/state), and the token palette is derived from the Storybook `:root` custom properties (name + resolved value)

### Requirement: Snapshot refreshes only on demand
The light stand-in snapshot MUST refresh only when the user explicitly triggers an "Update snapshot" action, and MUST NOT re-render the client's live Storybook on each canvas load.

#### Scenario: Updating after a component change
- **WHEN** the client changes a component and the user clicks "Update snapshot"
- **THEN** VortSpec re-reads the client's Storybook and regenerates the affected light stand-ins, while the Playground otherwise composes against the frozen snapshot without depending on the Storybook being up

