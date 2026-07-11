## ADDED Requirements

### Requirement: The activity bar is the single navigation
The activity bar SHALL be the IDE's sole navigation. It SHALL offer: sidebar-view activities (Explorer, Source Control, Settings) that render in the primary sidebar, and working-area activities (Flow/Pipeline, Run, Playground, Tokens, Manifest, History) that take over the working area. The reused cockpit panels SHALL render **chromeless** in the IDE — without their internal `ProjectRail` — because that rail's destinations (Flow, Run, Play, Tokens, Manifest, Source Control, History) now live on the activity bar. Selecting a sidebar-view activity SHALL show its view; selecting the active view's activity again SHALL toggle the primary sidebar's visibility.

#### Scenario: Switch to Source Control
- **WHEN** the user clicks the Source Control activity
- **THEN** the primary sidebar shows the Source Control view

#### Scenario: Panels render without their internal rail
- **WHEN** the user opens a working-area panel (e.g. Tokens, Flow, History) in the IDE
- **THEN** the panel is shown without its internal `ProjectRail`; the activity bar is the only navigation chrome

#### Scenario: Toggle the sidebar by re-clicking the active activity
- **WHEN** the Explorer view is active and visible and the user clicks the Explorer activity again
- **THEN** the primary sidebar collapses; clicking it once more reopens the Explorer

### Requirement: Activity-bar icons have hover tooltips
Every activity-bar icon SHALL show a text tooltip on hover (and an accessible name), because the icons are otherwise unlabeled.

#### Scenario: Hovering an activity shows its label
- **WHEN** the user hovers an activity-bar icon (e.g. Tokens)
- **THEN** a tooltip with that activity's label appears, and the icon exposes the same accessible name

### Requirement: Explorer shows full-color per-file-type icons
The Explorer SHALL render a **full-color** icon for each entry — a distinct color and glyph per file type (like a VS Code icon-theme extension), plus open/closed folder icons for directories — derived from the file's name/extension (e.g. TypeScript, React, JavaScript, JSON, Markdown, CSS/SCSS, HTML, YAML, images, lockfiles, git/dotfiles), with a generic fallback. Icons SHALL render inline and bundled (no network), so they work offline.

#### Scenario: File types are distinguished by color and glyph
- **WHEN** the Explorer lists `App.tsx`, `tokens.css`, and `package.json`
- **THEN** each shows a full-color icon distinct in both color and glyph (a React/TS icon, a CSS icon, a JSON icon), not a single monochrome file icon

#### Scenario: Directories show folder icons that reflect state
- **WHEN** a directory is collapsed then expanded
- **THEN** it shows a closed-folder icon when collapsed and an open-folder icon when expanded

### Requirement: Source Control view (GitHub / SCM + product configuration)
The primary sidebar SHALL offer a Source Control view that surfaces the workspace's git status and its GitHub/provider connection, accessible VS Code–style, reusing the shared Source Control surface. The user SHALL be able to reach the connection/authentication affordance from this view. This view is also where **project/product configuration** is reached (not the Settings view).

#### Scenario: Source Control view surfaces status and connection
- **WHEN** the user opens the Source Control view on a git workspace
- **THEN** it shows the branch and changes and a way to connect/authenticate the GitHub (or configured) provider, without leaving the IDE

### Requirement: Settings view scoped to the user profile
The primary sidebar SHALL offer a Settings view scoped to the **user profile** — the user's name/avatar/preferences via `profile:get`/`profile:save`. It SHALL be reachable from the activity bar. Project/product configuration SHALL NOT live here (it belongs to the Source Control view).

#### Scenario: Open Settings shows the user profile
- **WHEN** the user clicks the Settings activity
- **THEN** the primary sidebar shows the user's profile (name/avatar/preferences) and lets them change it, persisted through the profile handlers
