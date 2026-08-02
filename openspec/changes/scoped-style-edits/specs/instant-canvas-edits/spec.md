## MODIFIED Requirements

### Requirement: Every edit is routed by one classification rule

The system SHALL route every Playground edit through a single classification rule that decides between a **deterministic source write** and an **AI reconcile**, in this order:

1. **Input modality (primary).** An edit that originates from a **direct-manipulation handler** — `insert`, `move`, `grab`/reparent, `duplicate`, `delete`, or a prop/style/variant/text change — SHALL take the **deterministic** path. An edit expressed as a **language prompt** to the assistant SHALL take the **AI** path.
2. **Scope (deterministic path only).** A style edit carries a scope. At `element` or `selection` scope the write target is the page's own source, once per selected element. At `component` or `token` scope the write target is the durable personalization overlay, once, and the page's source is NOT touched. Choosing a scope SHALL NOT change the classification: every scope stays on the deterministic path.
3. **Static resolvability (guard, page-source writes only).** Before writing source, the target element's JSX anchor MUST be statically resolvable — a direct JSX child with a trustworthy source location, not inside a `.map()`/loop, conditional, or opaque HOC. Resolvable → write deterministically. Not resolvable → withhold the source write and offer an explicit assistant hand-off (see the resolvability-fallback requirement). This guard does not apply to overlay-scoped writes, which target a component or token identity rather than a JSX anchor.

The AI SHALL be invoked ONLY on an explicit language prompt or an explicit user-accepted hand-off — never silently, and never as the default handler for structural edits.

#### Scenario: A drag-to-move is handled deterministically
- **WHEN** the user drags an element into another container and its JSX is statically resolvable
- **THEN** the move is written to source as an AST codemod with no AI run

#### Scenario: A typed request goes to the AI
- **WHEN** the user asks the assistant in words to restructure or compose something new
- **THEN** the edit takes the AI path

#### Scenario: The AI is never invoked implicitly by a handler
- **WHEN** any direct-manipulation handler fires
- **THEN** the system SHALL NOT start an AI run as a side effect of that handler

#### Scenario: A widened scope stays deterministic
- **WHEN** the user commits a style edit at `component` or `token` scope
- **THEN** it SHALL be computed and written deterministically to the overlay with no AI run

#### Scenario: Resolvability does not gate an overlay write
- **WHEN** the selected element's JSX is not statically resolvable but the user edits at `component` scope
- **THEN** the overlay write SHALL proceed, because it targets the component's identity rather than that element's JSX

### Requirement: Direct-manipulation handlers write source deterministically

For `insert`, `move`, `grab`/reparent, `duplicate`, `delete`, and prop/style/variant/text edits, the system SHALL write the change to the real component source via an **AST codemod** (imports and formatting preserved), with no AI in the loop. `insert` targets a **known component from the picker** (insert the JSX node + ensure its import).

A style edit at `selection` scope SHALL be written as the same deterministic write applied once per selected element. Each element's write SHALL be independent: one element failing its resolvability guard SHALL NOT prevent the others from being written, and the elements that could not be written SHALL be named.

#### Scenario: Insert a known component
- **WHEN** the user drops a roster component from the picker into a resolvable slot
- **THEN** the component's JSX is inserted at that position and its import is added, deterministically

#### Scenario: Duplicate and delete
- **WHEN** the user duplicates or deletes a resolvable element
- **THEN** its JSX subtree is cloned or removed in source, deterministically

#### Scenario: A prop/style/text edit writes the exact JSX
- **WHEN** the user changes a prop, style, variant, or inline text on a resolvable element
- **THEN** the corresponding JSX prop / `className` / CVA variant / text node is rewritten deterministically (extending today's token-only deterministic path)

#### Scenario: A selection-scoped edit writes every member
- **WHEN** the user edits a style property with five resolvable elements selected
- **THEN** all five SHALL be written deterministically

#### Scenario: One unresolvable member does not block the rest
- **WHEN** one of the selected elements is not statically resolvable
- **THEN** the resolvable elements SHALL still be written
- **AND** the element that was not written SHALL be reported rather than silently skipped

## ADDED Requirements

### Requirement: A scoped edit is reversible as one action

An edit committed at any scope SHALL be undoable as a **single** action. Undoing a `selection`-scoped edit over N elements SHALL restore all N; undoing an overlay-scoped edit SHALL restore the prior override state, including removing an override the edit created.

#### Scenario: Undo restores every member of a fan-out
- **WHEN** the user commits an edit across five elements and then presses undo once
- **THEN** all five SHALL return to their prior values

#### Scenario: Undo removes an override the edit created
- **WHEN** an edit created a per-component override where none existed and the user undoes it
- **THEN** the override SHALL be removed rather than left at its previous-looking value
