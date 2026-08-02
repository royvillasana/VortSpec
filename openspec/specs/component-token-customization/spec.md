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

