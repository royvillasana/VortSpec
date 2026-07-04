# Capability: Projects Dashboard

## Purpose

Project listing and creation interface for the Design Inspector, providing card-based project browsing and new project creation.

## Requirements

### Requirement: Projects grid display
The Projects Dashboard SHALL display all user projects as cards in a responsive grid layout. Each card SHALL show the project name, last-updated timestamp, token count, component count, and project status.

#### Scenario: Dashboard shows project cards
- **WHEN** user navigates to `/projects`
- **THEN** all projects SHALL render as cards in a grid
- **AND** each card SHALL display name, timestamp, token/component counts, and status

### Requirement: Create project
The dashboard SHALL provide a "New project" action. Clicking it SHALL open a creation flow requiring only a project name.

#### Scenario: User creates a new project
- **WHEN** user clicks "New project" and enters a name
- **THEN** a new project SHALL be created and the user SHALL be navigated to the project's import page

### Requirement: Project card navigation
Clicking a project card SHALL navigate to that project's Inspector view.

#### Scenario: User selects a project
- **WHEN** user clicks a project card
- **THEN** the application SHALL navigate to `/projects/[id]/inspect/tokens`

### Requirement: Empty state
When no projects exist, the dashboard SHALL display an empty state with a prompt to create the first project.

#### Scenario: No projects exist
- **WHEN** user has zero projects
- **THEN** the dashboard SHALL show an empty state illustration and "Create your first project" call to action
