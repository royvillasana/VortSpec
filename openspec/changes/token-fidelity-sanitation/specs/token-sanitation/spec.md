## ADDED Requirements

### Requirement: Dedup before creating a token
Before promoting a detected value to a new token — or creating one in the Inspector — VortSpec SHALL resolve it against the union of Figma variables and existing code tokens. On a match (by link, name, or unique value) it SHALL NOT create a new token; it SHALL reuse the existing one and report which token was reused. Only an unmatched (`none`) value SHALL proceed to creation.

#### Scenario: A detected value that already exists is reused, not duplicated
- **WHEN** a component uses `#007AC3` and a token/variable with that value already exists
- **THEN** VortSpec SHALL bind the component to the existing token and SHALL NOT mint a new one

#### Scenario: A genuinely new value is created (and recorded)
- **WHEN** a detected value resolves to `none`
- **THEN** VortSpec MAY create a token for it and SHALL record it as a candidate orphan for reconciliation

### Requirement: Orphan detection with usage attribution
VortSpec SHALL identify code tokens (and detected literals) that resolve to `none` against Figma as **orphans**, and for each orphan SHALL collect where it is used (component, and section/property when recoverable) from the component-source scan.

#### Scenario: Orphans list where they are used
- **WHEN** `--custom-accent` is used in the Accordion and Nav but has no Figma counterpart
- **THEN** it SHALL appear in the orphan report as code-only, listing Accordion and Nav as usages

### Requirement: Push orphans back to Figma on confirmation
VortSpec SHALL present orphans as a single batched prompt asking whether to add them to Figma, and on confirmation SHALL push them via the existing layered push (routing each to the collection its siblings live in, aliasing where applicable). Nothing SHALL be written to Figma without confirmation.

#### Scenario: One-click push-back of the code-only tokens
- **WHEN** the user confirms the orphan prompt for N code-only tokens
- **THEN** VortSpec SHALL create them in Figma via the layered push and report how many were created

#### Scenario: Declining leaves Figma untouched
- **WHEN** the user dismisses the orphan prompt
- **THEN** no Figma write SHALL occur and the tokens remain flagged as orphans

### Requirement: Sanitation of existing duplicate and flattened tokens
VortSpec SHALL detect existing tokens whose value equals another token/variable under a different name (**duplicates**) and semantics whose value equals a primitive (**flattened aliases**), and SHALL offer gated actions to collapse duplicates to a canonical token and to re-alias flattened semantics to `var(--primitive)`. Cross-brand primitive collisions (the same value across brand modes) SHALL NOT be treated as duplicates.

#### Scenario: A flattened semantic is offered a re-alias
- **WHEN** `--color-surface-surface-control` holds `#007AC3` and `--color-excellus-blue-500` is `#007AC3`
- **THEN** VortSpec SHALL offer to re-alias the semantic to `var(--color-excellus-blue-500)`, gated behind confirmation

#### Scenario: Cross-brand same-value primitives are not flagged
- **WHEN** `grey-50` equals `#FFFFFF` in every brand mode
- **THEN** those per-brand primitives SHALL NOT be reported as duplicates
