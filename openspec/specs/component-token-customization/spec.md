# component-token-customization Specification

## Purpose
TBD - created by archiving change consume-component-libraries. Update Purpose after archive.
## Requirements
### Requirement: One edit surface personalizes any component's design system
A user SHALL personalize a project's design system by editing tokens/theme from VortSpec's existing token editor, and the change SHALL re-theme the project's components regardless of how each component entered VortSpec (built from scratch, light-page stand-in, enterprise-consumed, library-consumed, or draw-to-component). Design tokens SHALL be the single source of truth for personalization.

#### Scenario: Editing a token re-themes all sources
- **WHEN** the user changes a token (e.g. the primary color) in the token editor of a project
- **THEN** every component re-themes to the new value — built/CVA components, light-page stand-ins, and consumed-library components alike — without a separate per-library customization UI

#### Scenario: Works for a consumed library
- **WHEN** the project consumes a component library and the user edits the design system's tokens
- **THEN** the real library's components render with the personalized values, while still being the library's real components (not reimplemented look-alikes)

### Requirement: Durable per-project override overlay
Personalizations SHALL be recorded in a durable, project-scoped override map (global overrides keyed by token name; per-component overrides keyed by `data-component`) that is layered into the single token reader so all consumers see the overlaid values. The override map SHALL survive across sessions and SHALL NOT be lost on a re-provision or library update.

#### Scenario: Overrides persist and survive re-provision
- **WHEN** the user personalizes tokens and later re-provisions the library or reopens the project
- **THEN** the personalizations still apply, re-materialized on top of the (possibly updated) library

### Requirement: Per-source materialization of overrides
The override overlay SHALL be materialized in the form the component's runtime understands, selected per the project's library kind: CSS variables for CSS-var sources (shadcn, built/Tailwind, Astryx, MUI css-vars mode); a generated or patched project theme config mapped from VortSpec tokens for theme-object sources (MUI `createTheme`, Chakra `defineConfig`, Mantine `createTheme`, Ant Design `ConfigProvider`); and a VortSpec-owned overlay resolved on top for enterprise sources. VortSpec SHALL NOT fork or hand-edit a node_modules library's source to apply a theme.

#### Scenario: Theme-object library materialization
- **WHEN** the project consumes a theme-object library (e.g. MUI) and the user edits tokens
- **THEN** VortSpec regenerates/patches a VortSpec-owned project theme config from the tokens (never editing the library's package source), and the components pick it up via the library's provider

#### Scenario: CSS-variable source materialization
- **WHEN** the project uses a CSS-variable source (e.g. shadcn or built Tailwind components) and the user edits tokens
- **THEN** VortSpec writes the project's CSS variables and the components re-theme on the next render/build

### Requirement: Personalizing a consumed source never modifies its real source
For enterprise (and any consume source whose `token_file`/components point at code VortSpec does not own), personalization SHALL be applied via a VortSpec-owned overlay resolved on top at preview/build time, and SHALL NEVER write into the consumed source's real files.

#### Scenario: Enterprise personalization via overlay
- **WHEN** the user personalizes tokens on an enterprise project whose `token_file` points at the client's real token source
- **THEN** the change is stored in the VortSpec-owned overlay and resolved on top for preview/build, and the client's real token file is never modified

### Requirement: Multi-format token writing
The token editor's write path SHALL support the token-file formats the supported sources use — at minimum CSS custom properties, and additionally JS/TS theme objects (and SCSS/JSON design tokens) — so that editing a token succeeds whether the project's token source is CSS or a theme object. A write to an unsupported format SHALL surface an error rather than silently no-op.

#### Scenario: Editing a JS theme-object token file
- **WHEN** the user edits a token whose source is a JS/TS theme object (e.g. an MUI/Chakra theme)
- **THEN** the value is written into the theme object correctly (preserving surrounding code) — not silently ignored as today's CSS-only writer would

### Requirement: Per-component customization keyed by identity
A user SHALL be able to override a single component's styling/variant while keeping the library, keyed by `data-component`, and VortSpec SHALL materialize that override into the component's per-component lever for its source (a copied file's variant map, or the library's per-component theme override).

#### Scenario: Overriding one component
- **WHEN** the user customizes a single consumed component (e.g. give Button a new brand variant) without changing others
- **THEN** the override is stored against that component's `data-component` and applied via the library's per-component override mechanism, leaving other components and the library untouched

### Requirement: Tokens are read through the token file's `@import` chain
Reading a project's tokens SHALL follow the `@import` chain of its configured token file — relative
partials and bare package specifiers alike, the latter resolved through the package's `exports` map — and
parse the flattened result in cascade order, so the importing file's declarations override what it imports.
This is required because a consumed library's token file typically declares nothing itself and only imports
the vendor's theme. Each token SHALL record which file declares it. An edit SHALL be written to that file
when the project owns it, and SHALL route to the durable overlay when it lives in a dependency — a
dependency's files are never modified.

#### Scenario: A vendor theme's real tokens are visible and editable
- **WHEN** the project's token file only `@import`s a component library's published theme stylesheet
- **THEN** that theme's tokens are listed with their real values, each lever shows its live value, and editing one writes the durable overlay while the installed package stays byte-identical

#### Scenario: A project's own partial is edited in place
- **WHEN** a token is declared in a partial the project's token file `@import`s, and the project owns that partial
- **THEN** the edit is written into that partial rather than routed to the overlay, and the partial is included in the revert snapshot

#### Scenario: A light/dark pair keeps its dark half
- **WHEN** the user edits a token whose value is `light-dark(<light>, <dark>)`
- **THEN** only the light half is replaced and the library's dark-mode value is preserved

### Requirement: Property-indexed view of the design system
The customization layer SHALL provide a reader that indexes a project's design system BY STYLE PROPERTY —
color, border-radius, spacing, shadow, typography — reporting, for each property, the tokens of that type
and, for each token, the components bound to it for that property. The index SHALL be derived from the
project's real tokens, screens, and component stand-ins rather than from a fixed per-library list, and SHALL
be overlay-aware so every value reported is the live one.

#### Scenario: Index reports tokens and their users per property
- **WHEN** the reader is asked for the border-radius property on a project whose screens round several components
- **THEN** it returns that project's radius tokens with, for each, the components that use it for border-radius, and each token's live value

#### Scenario: A token nothing uses is still reported
- **WHEN** the design system defines a token no component currently binds
- **THEN** the index reports it with an empty component list rather than omitting it

#### Scenario: A binding with no component identity is not misattributed
- **WHEN** a screen binds a token without marking the element's component
- **THEN** the binding contributes to the token's presence but is not attributed to any component

### Requirement: Re-pointing a component's property to a different token
The customization layer SHALL support changing WHICH design-system token a single component uses for a
given style property, keyed by `data-component`, without altering the token's own value and without
affecting other components bound to either token. The re-point SHALL be recorded in the durable overlay.

#### Scenario: One component moves to a different token
- **WHEN** a component's border-radius is re-pointed from one radius token to another
- **THEN** only that component renders with the new token's value; the tokens' own values are unchanged and other components using either token are unaffected

### Requirement: The per-component override has a UI entry point

Per-component customization SHALL be reachable from the product, not only from the engine. The system SHALL provide at least one surface from which a user can set a per-component override without editing a file by hand.

This closes a gap in which the override path existed end to end — schema, materializer, IPC handler, preload binding — with no caller, so the capability was specified and shipped but could not be exercised.

#### Scenario: A component override can be created from the canvas
- **WHEN** the user selects an element carrying a `data-component` and edits a style property at `component` scope
- **THEN** a per-component override SHALL be written for that component

#### Scenario: The capability is exercisable without hand-editing
- **WHEN** a user wants every instance of a component to take a style
- **THEN** they SHALL be able to do it from the product's own surfaces

### Requirement: Existing per-component overrides are visible and clearable

Every per-component override in the project's overlay SHALL be listed in the design-system surface, showing the component, the properties it sets, and their values. Each SHALL be individually clearable.

An override that applies to every instance on every page while appearing in no screen is indistinguishable from a bug: the user sees an effect with no cause and no way to undo it.

#### Scenario: Overrides are listed
- **WHEN** the project's overlay contains per-component overrides
- **THEN** the design-system surface SHALL list each one with its component, properties, and values

#### Scenario: An override can be cleared
- **WHEN** the user clears a listed override
- **THEN** it SHALL be removed from the overlay
- **AND** the affected instances SHALL return to their inherited values

#### Scenario: An override written before this capability is still shown
- **WHEN** the overlay contains an override written by an earlier version with no record of who set it
- **THEN** it SHALL be listed and clearable on the same terms as any other
