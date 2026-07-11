# screen-creation-runtime

## ADDED Requirements

### Requirement: Vibe-engineer screens from the built design system
The app SHALL let the user compose new screens/features conversationally from within
VortSpec using the built components — once a design system (component set + tokens +
DESIGN.md) exists and is pushed — driven by Claude Code through the SDD-DE Screen Creation flow.

#### Scenario: Describe a screen, get an implementation
- **WHEN** the user describes a screen/feature in natural language in the app
- **THEN** VortSpec runs the SDD-DE Screen Creation cycle (enrich → specs → implement)
  composing the screen from the built components + tokens, reading DESIGN.md as the
  hand-off, and iterates conversationally

#### Scenario: Spec-first and additive
- **WHEN** a screen is generated
- **THEN** it is gated (specs approved before implementation) and written into the project
  as normal files; publishing follows the additive/no-delete git guardrail (new branch + PR)

### Requirement: Run a live localhost app environment
The app SHALL run the project's own application dev server on localhost and preview the
running app inside VortSpec, so the user can run and interact with what they build.

#### Scenario: Run the app locally
- **WHEN** the user starts the app runtime
- **THEN** VortSpec launches the project's app dev script (confined to the project folder),
  parses the local URL, and embeds/links the running app; it is distinct from the
  Storybook component preview

#### Scenario: Live iteration loop
- **WHEN** the user vibe-engineers a change while the app runtime is running
- **THEN** the change lands in the project files and the running localhost app reflects it
  (hot reload), closing the build-and-run loop without leaving the app
