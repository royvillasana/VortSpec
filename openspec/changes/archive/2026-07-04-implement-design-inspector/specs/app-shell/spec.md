## ADDED Requirements

### Requirement: Shared inspector layout shell
The application SHALL render a persistent layout shell for all Inspector routes consisting of a 220px left navigation rail, a flexible main content area, and a 48px chat strip on the right edge.

#### Scenario: Inspector layout renders on all inspect routes
- **WHEN** user navigates to any route under `/projects/[id]/inspect/*`
- **THEN** the left nav rail (220px, background `#141518`, right border `#26282D`), main content area, and chat strip (48px, background `#141518`, left border `#26282D`) SHALL be visible

### Requirement: Project header in nav rail
The nav rail SHALL display a project header at the top with the project's initial letter in a colored badge (20x20px, border-radius 6px, background `#7C6FF0`), project name (Geist 600 13px), and a subtitle showing version label and token count in Geist Mono 11px `#6B7280`. The header SHALL link to the Projects Dashboard.

#### Scenario: Project header displays project info
- **WHEN** the Inspector layout renders
- **THEN** the project header SHALL show the project initial, name, version, and token count
- **AND** clicking the header SHALL navigate to `/projects`

### Requirement: Navigation links
The nav rail SHALL display navigation links for Tokens, Components, Graph, Issues, and History sections. Each link SHALL show an SVG icon (14x14) and label. The active link SHALL have background `#1B1D21`, color `#7C6FF0`, and font-weight 500. Inactive links SHALL have color `#9BA1AB` and highlight on hover with background `#1B1D21` and color `#E7E9EC`.

#### Scenario: Active nav link highlights current section
- **WHEN** user is on the Graph section
- **THEN** the Graph nav link SHALL render with active styling (background `#1B1D21`, color `#7C6FF0`)
- **AND** all other nav links SHALL render with inactive styling

#### Scenario: Nav link navigation
- **WHEN** user clicks a nav link
- **THEN** the main content area SHALL display the corresponding section
- **AND** the URL SHALL update to the corresponding route

### Requirement: Issues badge count
The Issues nav link SHALL display a badge showing the count of open issues, styled with Geist Mono 11px, background `#1B1D21`, border `#34373D`, color `#FFB224`, border-radius 999px.

#### Scenario: Issue count badge renders
- **WHEN** the project has 31 open issues
- **THEN** the Issues nav link SHALL display a badge showing "31" in amber

### Requirement: Settings link
The nav rail SHALL display a Settings link at the bottom with a gear icon and label, color `#6B7280`, hover to `#E7E9EC` with background `#1B1D21`.

#### Scenario: Settings link renders at bottom of nav
- **WHEN** the Inspector layout renders
- **THEN** the Settings link SHALL appear at the bottom of the nav rail, pushed down by flex spacer

### Requirement: Chat strip toggle
The chat strip SHALL display a chat bubble icon button (32x32px). Clicking it SHALL open the full Assistant drawer. The icon SHALL be `#9BA1AB` with hover to `#E7E9EC`.

#### Scenario: Chat strip opens assistant
- **WHEN** user clicks the chat icon in the strip
- **THEN** the Assistant drawer SHALL open from the right

### Requirement: Global dark theme
The application SHALL use a dark theme with background `#0B0C0E`, text `#E7E9EC`, font-family Geist (400/500/600) with Geist Mono for code values. Custom scrollbars SHALL use thumb `#26282D` with border-radius 8px on transparent track.

#### Scenario: Dark theme applies globally
- **WHEN** any page renders
- **THEN** the background SHALL be `#0B0C0E`, text SHALL be `#E7E9EC`, and scrollbars SHALL use dark styling
