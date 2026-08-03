## ADDED Requirements

### Requirement: Every style edit carries an explicit scope

A style edit SHALL be a value **and** a scope. The system SHALL support exactly four scopes, and every scope SHALL be reachable from the same control that sets the value:

| Scope | Applies to | Persists as |
|---|---|---|
| `element` | the one focused element | the page's own source |
| `selection` | every element in the current multi-selection | the page's own source, per element |
| `matching` | every element that currently **looks the same** — same `data-component` AND the same current value for the property being edited | the page's own source, per element |
| `component-token` | every instance of one component, on every page — **without** touching other components that share the token | the durable overlay, as a component-scoped redefinition of the token |
| `token` | every element resolving the property through that token | the durable overlay's token override |

`component-token` exists because a token is shared. `--radius-element` may be read by Button AND Card, so
"change every Button" cannot be done by writing the token — that would change Cards too. It is instead
written as a redefinition of the SAME token, scoped to the component:

```
[data-component="Button"] { --radius-element: 4px; }
```

Buttons take the new value, Cards keep the old one, and the value stays a token rather than becoming a
hardcoded literal — so it still follows a later theme or preset. The scoped value INHERITS to the
component's descendants, which is intended (a button and its parts) but SHALL be stated, not discovered.

`matching` and `component-token` both answer "apply to the other buttons" and are both offered. They are
not the same question: `matching` takes the ones that look alike *today* and writes this page's source;
`component-token` takes every instance by identity, on every page, and writes the design system.

`matching` is deliberately NOT "every instance of this component". An element of the same component that has
already been styled differently was styled differently on purpose; sweeping it up in a change aimed at the
ones that look alike destroys a decision the user made earlier and did not revisit. The rule is therefore
narrow and stated: same component, same current value for this property.

The scope SHALL be visible on the edit control before the value is committed. The system SHALL NOT apply an edit at a scope the user did not see.

#### Scenario: The scope is part of the edit control
- **WHEN** the user focuses a style property with an element selected
- **THEN** the available scopes SHALL be shown alongside the value field
- **AND** the scope that will be used SHALL be indicated before any value is typed

#### Scenario: The same value routes by scope
- **WHEN** the user sets `border-radius: 12px` at `matching` scope on a Button
- **THEN** every element that shares that Button's component and its current radius SHALL take the new value
- **AND** the same edit at `element` scope SHALL change only the one element

#### Scenario: A differently-styled sibling is left alone
- **WHEN** the page has ten Buttons at `8px` and three at `16px`, and the user edits one of the `8px` ones at `matching` scope
- **THEN** the ten SHALL change
- **AND** the three SHALL keep `16px`, because they were styled differently on purpose

#### Scenario: An unavailable scope is not offered
- **WHEN** the selected element carries no `data-component`
- **THEN** the `matching` scope SHALL NOT be offered
- **AND** the remaining scopes SHALL still be available

### Requirement: Blast radius is stated before the write, never after

Each offered scope SHALL be labelled with the **count of elements it will affect**, computed from the current page and the design system rather than estimated. A scope whose reach cannot be counted SHALL say so rather than showing a number that might be wrong.

#### Scenario: Counts are shown per scope
- **WHEN** the scope options are displayed for a selected Button
- **THEN** each SHALL carry its reach — e.g. `This element`, `5 selected`, `10 Buttons like this`, `--radius-card · 40 uses`

#### Scenario: A count that cannot be computed is not invented
- **WHEN** the reach of a scope cannot be determined for the current page
- **THEN** that scope SHALL be presented without a count rather than with a guessed one

#### Scenario: Counts reflect the live page
- **WHEN** the page changes so that a component's instance count changes
- **THEN** the next time scopes are shown their counts SHALL reflect the new page

### Requirement: The default scope is derived from what the selection shares

The system SHALL preselect a scope by a deterministic rule over the current selection and the property being edited, applied in order:

1. If **every** selected element resolves that property through the **same token** AND shares the **same `data-component`**, the default SHALL be `component-token`.
2. Otherwise, if **every** selected element resolves that property through the **same token**, the default SHALL be `token`.
3. Otherwise, if **every** selected element shares the **same `data-component`** and the same current value for the property, the default SHALL be `matching`.
4. Otherwise, if more than one element is selected, the default SHALL be `selection`.
5. Otherwise the default SHALL be `element`.

Rule 1 sits above rule 2 because it satisfies the same principle without the spill: it still points at the
token — the thing that actually decides the value — but confines the change to the component the user was
looking at. Changing the token globally stays one click away, labelled with its use count.

The rule SHALL depend only on facts the selection literally exposes. The system SHALL NOT infer intent from edit history, frequency, or heuristics beyond the above, and the derived default SHALL always be overridable.

#### Scenario: A shared token AND a shared component default to the component-scoped token
- **WHEN** the user selects three Cards whose `border-radius` all resolve to `var(--radius-card)`
- **THEN** the default scope SHALL be `component-token` for Card / `--radius-card`
- **AND** changing it SHALL NOT change a Button that also reads `--radius-card`

#### Scenario: A shared token across different components defaults to the token
- **WHEN** the selected elements share `--radius-card` but are not all the same component
- **THEN** the default scope SHALL be `token`, since there is no single component to scope to

#### Scenario: A shared component and a shared value default to matching
- **WHEN** the user selects four Buttons that share a component and all currently read `8px`
- **THEN** the default scope SHALL be `matching`

#### Scenario: A mixed selection defaults to the selection
- **WHEN** the user selects a Button and a Card with no shared token for the property
- **THEN** the default scope SHALL be `selection`

#### Scenario: Same component but different values does not default to matching
- **WHEN** the user selects four Buttons whose radii differ from one another
- **THEN** the default SHALL be `selection`, since there is no single "looks like this" to match

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

An edit at `token` scope writes to the durable overlay rather than the page's source. The system SHALL make such an edit visible on the open screen without a manual reload, on the same terms as an element edit.

#### Scenario: A token-scoped edit re-themes the screen
- **WHEN** the user sets a radius at `token` scope
- **THEN** every element resolving through that token SHALL show the new radius without the user reloading

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


### Requirement: The design system shows which of its values compose the selection

When an element is selected, the design-system surface SHALL indicate which of its rows that element
actually resolves through — its background, its type, its radius — leaving every other row, and the order
and grouping of all of them, unchanged.

The design system is the same design system whatever is selected; hiding or reordering it per selection
would make it unlearnable. The point is to answer "what is this component made of?" against a stable list,
not to present a different list.

#### Scenario: The rows in use are marked
- **WHEN** a Button that resolves its background through `--color-accent` and its radius through `--radius-element` is selected
- **THEN** those rows SHALL be marked as in use by the selection

#### Scenario: Nothing else moves
- **WHEN** a selection marks some rows
- **THEN** every other row SHALL remain visible, in its existing section and its existing order

#### Scenario: Deselecting removes the marking
- **WHEN** the selection is cleared
- **THEN** no rows SHALL be marked, and the surface SHALL read exactly as it did before anything was selected


### Requirement: A component-scoped token change spares the components that share the token

An edit at `component-token` scope SHALL change the token's value only within the chosen component. Every
other component resolving through the same token SHALL keep its value.

The value SHALL remain a token reference rather than being replaced by a literal, so the component still
follows later changes to the design system that do not concern this property.

#### Scenario: Siblings that share the token are untouched
- **WHEN** Button and Card both read `--radius-element`, and the user sets it to `4px` at `component-token` scope on a Button
- **THEN** every Button SHALL render `4px`
- **AND** every Card SHALL keep the design system's value

#### Scenario: The scoped value reaches the component's parts
- **WHEN** an element inside a Button also reads `--radius-element`
- **THEN** it SHALL take the Button's scoped value
- **AND** the same element outside a Button SHALL keep the design system's value

#### Scenario: The relationship to the token survives
- **WHEN** an edit is made at `component-token` scope
- **THEN** the component SHALL still resolve the property through that token, not through a hardcoded value

#### Scenario: A consumed library is never edited to achieve this
- **WHEN** the project consumes its components from a library
- **THEN** the scoped redefinition SHALL be written to the durable overlay
- **AND** the library's own source SHALL NOT be modified

### Requirement: Component-scoped token overrides are visible and clearable

A component-scoped token redefinition SHALL be listed in the design-system surface alongside the other
per-component overrides, showing the component, the token, and the value, and SHALL be individually
clearable — for the same reason any other override must be: an effect with no visible cause cannot be
told apart from a bug.

#### Scenario: The override is listed
- **WHEN** a component-scoped token redefinition exists
- **THEN** the design-system surface SHALL show the component, the token and its scoped value

#### Scenario: Clearing restores the design system's value
- **WHEN** the user clears it
- **THEN** that component SHALL return to the token's own value


### Requirement: A value the design system does not define is named, never silently absent

The design-system surface SHALL name a token it does not contain when the selection resolves a property
through one, showing the token and its value rather than showing nothing.

Showing nothing answers "what is this component made of?" with silence, which reads as a broken panel. It
is also the more important answer: a screen running on tokens the design system never defined has drifted
from it, and that is a fact worth surfacing at the moment the user is looking straight at it.

#### Scenario: An unmapped token is named
- **WHEN** a selected Button's radius resolves through `--radius-pill`, which the design system does not define
- **THEN** the surface SHALL show `--radius-pill` and its value, marked as not part of the design system

#### Scenario: The marked rows and the unmapped ones are told apart
- **WHEN** a selection uses both design-system tokens and tokens the design system lacks
- **THEN** the former SHALL be marked in place among the design system's own rows
- **AND** the latter SHALL be listed separately, so neither is mistaken for the other

#### Scenario: Nothing is claimed when nothing is unmapped
- **WHEN** every token the selection uses exists in the design system
- **THEN** no unmapped list SHALL be shown

#### Scenario: Deselecting withdraws the list
- **WHEN** the selection is cleared
- **THEN** the unmapped list SHALL be withdrawn along with the marking

### Requirement: An unmapped token can be adopted into the design system

Each unmapped token SHALL offer to be added to the design system, with its current value, through the same
token-creation path any other new token uses. Adoption SHALL be an explicit per-token action — never
automatic, and never a side effect of selecting something.

Adopting is how a screen's drift is closed in the direction the user actually works: they chose a value on
the page, and the design system follows.

#### Scenario: Adopting adds the token
- **WHEN** the user adopts `--radius-pill` at `999px`
- **THEN** the design system SHALL contain `--radius-pill` with that value
- **AND** it SHALL appear among the design system's rows, marked as used by the selection

#### Scenario: Adoption is never automatic
- **WHEN** a selection exposes unmapped tokens
- **THEN** the design system SHALL NOT be modified until the user adopts one

#### Scenario: A failed adoption says so and changes nothing
- **WHEN** adopting fails
- **THEN** the failure SHALL be reported
- **AND** the design system SHALL be left as it was


### Requirement: A composed page binds to the design system's tokens, not to copies of their values

A page composed from the design system SHALL style design-system properties with a **token reference**
carrying the resolved value as a CSS fallback — `var(--color-accent, #5433eb)` — rather than with the
resolved value alone.

Styling with the value alone severs the page from the design system at the moment it is created. The page
still renders, so nothing looks wrong, but every later question — what is this component made of, what
does changing this token affect, which screens drifted — has no answer for it, and a token edit cannot
reach it. The fallback preserves the property that motivated the value-only rule: the page still renders
standalone, opened as a bare file with no token runtime.

The page SHALL NOT declare its own name for a value the design system already names.

#### Scenario: A design-system property is bound
- **WHEN** a composed page styles a button's background from the design system's accent
- **THEN** it SHALL emit `var(--color-accent, …)` rather than the colour alone

#### Scenario: The page still renders with no tokens present
- **WHEN** the page is opened with no design-system CSS available
- **THEN** every bound property SHALL fall back to its resolved value and render as composed

#### Scenario: An existing name is not duplicated under a new one
- **WHEN** the design system defines a radius for fully-rounded elements
- **THEN** the page SHALL use that token rather than declaring its own equivalent

#### Scenario: A value the design system does not name may still be local
- **WHEN** the page needs a value the design system does not define
- **THEN** it MAY declare its own, and that token SHALL be reported as not part of the design system
