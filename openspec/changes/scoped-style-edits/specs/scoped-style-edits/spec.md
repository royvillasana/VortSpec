## ADDED Requirements

### Requirement: Every style edit carries an explicit scope

A style edit SHALL be a value **and** a scope. The system SHALL support exactly four scopes, and every scope SHALL be reachable from the same control that sets the value:

| Scope | Applies to | Persists as |
|---|---|---|
| `element` | the one focused element | the page's own source |
| `selection` | every element in the current multi-selection | the page's own source, per element |
| `component` | every instance of one `data-component`, on every page | the durable overlay's per-component override |
| `token` | every element resolving the property through that token | the durable overlay's token override |

The scope SHALL be visible on the edit control before the value is committed. The system SHALL NOT apply an edit at a scope the user did not see.

#### Scenario: The scope is part of the edit control
- **WHEN** the user focuses a style property with an element selected
- **THEN** the available scopes SHALL be shown alongside the value field
- **AND** the scope that will be used SHALL be indicated before any value is typed

#### Scenario: The same value routes by scope
- **WHEN** the user sets `border-radius: 12px` at `component` scope on a Button
- **THEN** the write SHALL go to the per-component override, not to the page's source
- **AND** the same edit at `element` scope SHALL go to the page's source instead

#### Scenario: An unavailable scope is not offered
- **WHEN** the selected element carries no `data-component`
- **THEN** the `component` scope SHALL NOT be offered
- **AND** the remaining scopes SHALL still be available

### Requirement: Blast radius is stated before the write, never after

Each offered scope SHALL be labelled with the **count of elements it will affect**, computed from the current page and the design system rather than estimated. A scope whose reach cannot be counted SHALL say so rather than showing a number that might be wrong.

#### Scenario: Counts are shown per scope
- **WHEN** the scope options are displayed for a selected Button
- **THEN** each SHALL carry its reach — e.g. `This element`, `5 selected`, `All 12 Buttons`, `--radius-card · 40 uses`

#### Scenario: A count that cannot be computed is not invented
- **WHEN** the reach of a scope cannot be determined for the current page
- **THEN** that scope SHALL be presented without a count rather than with a guessed one

#### Scenario: Counts reflect the live page
- **WHEN** the page changes so that a component's instance count changes
- **THEN** the next time scopes are shown their counts SHALL reflect the new page

### Requirement: The default scope is derived from what the selection shares

The system SHALL preselect a scope by a deterministic rule over the current selection and the property being edited, applied in order:

1. If **every** selected element resolves that property through the **same token**, the default SHALL be `token`.
2. Otherwise, if **every** selected element shares the **same `data-component`**, the default SHALL be `component`.
3. Otherwise, if more than one element is selected, the default SHALL be `selection`.
4. Otherwise the default SHALL be `element`.

The rule SHALL depend only on facts the selection literally exposes. The system SHALL NOT infer intent from edit history, frequency, or heuristics beyond the above, and the derived default SHALL always be overridable.

#### Scenario: A shared token binding defaults to the token
- **WHEN** the user selects three cards whose `border-radius` all resolve to `var(--radius-card)`
- **THEN** the default scope SHALL be `token` for `--radius-card`

#### Scenario: A shared component defaults to the component
- **WHEN** the user selects four Buttons whose radii are hardcoded and differ
- **THEN** the default scope SHALL be `component` for Button

#### Scenario: A mixed selection defaults to the selection
- **WHEN** the user selects a Button and a Card with no shared token for the property
- **THEN** the default scope SHALL be `selection`

#### Scenario: The default is a default, not a decision
- **WHEN** any scope has been derived as the default
- **THEN** the user SHALL be able to choose any other available scope before committing

### Requirement: An element edit governed by a token offers promotion

When an `element`- or `selection`-scoped edit would hardcode a value onto elements that resolve that property through a shared token, the system SHALL offer to change the **token** instead, naming the token and its use count. The offer SHALL be an offer: declining SHALL complete the original edit at the original scope, unchanged.

#### Scenario: Promotion is offered
- **WHEN** the user hardcodes `border-radius: 4px` on two elements that both read `var(--radius-card)`
- **THEN** the system SHALL offer to set `--radius-card` to `4px` instead, stating how many uses that affects

#### Scenario: Declining leaves the edit intact
- **WHEN** the user declines the promotion
- **THEN** the per-element edit SHALL be applied exactly as originally scoped
- **AND** the token SHALL be left unchanged

#### Scenario: Promotion is not offered when it would be wrong
- **WHEN** the selected elements do not share a token for that property
- **THEN** no promotion SHALL be offered

### Requirement: Overlay-scoped edits reach the open screen immediately

An edit at `component` or `token` scope writes to the durable overlay rather than the page's source. The system SHALL make such an edit visible on the open screen without a manual reload, on the same terms as an element edit.

#### Scenario: A component-scoped edit re-themes the screen
- **WHEN** the user sets a radius at `component` scope
- **THEN** every instance on the open screen SHALL show the new radius without the user reloading

#### Scenario: The screen follows the overlay whoever wrote it
- **WHEN** the overlay changes from another surface — the design-system sidebar, a preset, or an agent
- **THEN** the open screen SHALL pick the change up on the same terms

### Requirement: Scope never silently widens

An edit SHALL be applied at the scope shown at the moment it was committed. A later change of selection, page, or default SHALL NOT retroactively widen or narrow an applied edit.

#### Scenario: Changing selection does not re-apply
- **WHEN** the user commits an edit at `selection` scope and then selects different elements
- **THEN** the committed edit SHALL remain applied to the original elements only

#### Scenario: A scope change mid-edit re-states the reach
- **WHEN** the user switches scope while a value is in the field
- **THEN** the stated reach SHALL update before the value is committed at the new scope
