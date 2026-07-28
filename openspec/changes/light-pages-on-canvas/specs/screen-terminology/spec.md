## ADDED Requirements

### Requirement: The UI never exposes the lightweight implementation to the user

The user-facing UI MUST present the artifacts the user creates and edits in the Playground as
plain "pages" or "screens". It MUST NOT surface the words "light", "lightweight", or the
HTML/CSS/JS implementation detail anywhere the user sees (labels, buttons, empty states, tree
nodes, canvas headers, tooltips). The implementation (HTML/CSS/JS, optionally Astro-style
Dynamic Islands) is internal knowledge only.

#### Scenario: Creating a screen shows no "light" wording
- **WHEN** the user creates or opens a screen in the Playground
- **THEN** every visible label/affordance calls it a "page" or "screen"
- **AND** no visible text says "light", "lightweight", or references the HTML implementation

#### Scenario: The site tree lists screens plainly
- **WHEN** the site tree shows the user's created screens
- **THEN** they appear as ordinary pages/screens (no "light" badge or wording)

### Requirement: Internal naming may still identify the kind

The no-"light"-wording rule MUST constrain ONLY what the end user sees in the app UI, and MUST
NOT force renaming internal code or on-disk paths. Internal code, file paths, and
developer-facing artifacts MAY still use "light" to distinguish the kind (e.g.
`.vortspec/light-pages/`, page-kind routing).

#### Scenario: Internal paths are unaffected
- **WHEN** a screen is persisted
- **THEN** it may live under an internal path such as `.vortspec/light-pages/<name>.html`
- **AND** this internal name is never shown to the user in the UI
