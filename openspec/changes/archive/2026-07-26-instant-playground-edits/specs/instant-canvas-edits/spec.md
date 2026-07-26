## ADDED Requirements

### Requirement: Every edit is routed by one classification rule

The system SHALL route every Playground edit through a single classification rule that decides between a **deterministic source write** and an **AI reconcile**, in this order:

1. **Input modality (primary).** An edit that originates from a **direct-manipulation handler** — `insert`, `move`, `grab`/reparent, `duplicate`, `delete`, or a prop/style/variant/text change — SHALL take the **deterministic** path. An edit expressed as a **language prompt** to the assistant SHALL take the **AI** path.
2. **Static resolvability (guard, deterministic path only).** Before writing source, the target element's JSX anchor MUST be statically resolvable — a direct JSX child with a trustworthy source location, not inside a `.map()`/loop, conditional, or opaque HOC. Resolvable → write deterministically. Not resolvable → withhold the source write and offer an explicit assistant hand-off (see the resolvability-fallback requirement).

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

### Requirement: Direct-manipulation handlers write source deterministically

For `insert`, `move`, `grab`/reparent, `duplicate`, `delete`, and prop/style/variant/text edits, the system SHALL write the change to the real component source via an **AST codemod** (imports and formatting preserved), with no AI in the loop. `insert` targets a **known component from the picker** (insert the JSX node + ensure its import).

#### Scenario: Insert a known component
- **WHEN** the user drops a roster component from the picker into a resolvable slot
- **THEN** the component's JSX is inserted at that position and its import is added, deterministically

#### Scenario: Duplicate and delete
- **WHEN** the user duplicates or deletes a resolvable element
- **THEN** its JSX subtree is cloned or removed in source, deterministically

#### Scenario: A prop/style/text edit writes the exact JSX
- **WHEN** the user changes a prop, style, variant, or inline text on a resolvable element
- **THEN** the corresponding JSX prop / `className` / CVA variant / text node is rewritten deterministically (extending today's token-only deterministic path)

### Requirement: Edits are optimistic and gate-less — no Save or Keep

An edit SHALL apply to the live preview **immediately** and be persisted to source **automatically**. There SHALL be no Apply, Keep, Save, or Revert step required to see or retain a manual edit. Reverting an edit is done through undo (Ctrl-Z).

#### Scenario: The change is visible with no save
- **WHEN** the user makes any direct-manipulation edit
- **THEN** the preview reflects it immediately, without the user invoking Apply, Keep, or Save

#### Scenario: Undo replaces revert
- **WHEN** the user presses undo after an edit
- **THEN** the edit is reversed in both the preview and source, and redo re-applies it

### Requirement: Persistence to source is background, debounced, dirty-scoped, single-flight

Deterministic source writes SHALL happen in the background without blocking the edit loop: coalesced/debounced, scoped to only the changed elements/files, with at most one write in flight plus one queued follow-up. The user SHALL continue editing while a write is pending.

#### Scenario: Rapid edits collapse into one write
- **WHEN** the user makes several edits in quick succession
- **THEN** they are coalesced and persisted as a scoped background write, and the UI never blocks waiting on it

#### Scenario: A write failure is surfaced without losing the visual edit
- **WHEN** a background source write fails
- **THEN** the optimistic visual edit is retained and the failure is surfaced as a fixable notice, not a silent drop

### Requirement: A persisted edit updates only its own element via HMR

When a background write lands, the preview SHALL update **only the affected component** through the dev server's hot-module replacement, not a full-page reload. Until the write lands, the optimistic overlay stands in for the change.

#### Scenario: One element updates, the rest stays
- **WHEN** a background write to one component completes
- **THEN** the dev server hot-swaps that component in place and the rest of the page is not reloaded or reset

### Requirement: Un-resolvable handler ops fall back to an explicit hand-off, never a silent AI run

When a direct-manipulation handler targets JSX that is not statically resolvable (inside a `.map()`/loop, conditional, or opaque boundary), the system SHALL keep the optimistic visual change, withhold the deterministic source write, and offer the user an **explicit** action to ask the assistant to make it real. It SHALL NOT start an AI run automatically.

#### Scenario: Editing an element inside a list
- **WHEN** the user moves or edits an element rendered inside a `.map()` and the anchor is not statically resolvable
- **THEN** the visual change still shows, the deterministic write is withheld, and the user is offered an explicit "ask the assistant" action
- **AND** no AI run starts unless the user accepts that action

### Requirement: Deterministic writes are reversible via snapshots

Each deterministic source write SHALL be captured under the existing snapshot mechanism so it can be reverted, consistent with how AI-driven edits are gated today.

#### Scenario: Revert a deterministic structural change
- **WHEN** the user undoes a deterministic insert/move/duplicate/delete
- **THEN** the source is restored from the snapshot and the preview reflects the restored state
