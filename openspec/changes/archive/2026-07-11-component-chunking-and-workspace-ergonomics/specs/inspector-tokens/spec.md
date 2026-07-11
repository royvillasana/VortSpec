## ADDED Requirements

### Requirement: Navigable token where-used list
The token detail view SHALL present the components that use a token as a navigable list, grouping multiple property hits per component, and clicking a component SHALL open its source file.

#### Scenario: Jump from token to component
- **WHEN** the user opens a token that is used by a component and clicks that component in the where-used list
- **THEN** the component's source file SHALL open
