# instant-canvas-edits

## ADDED Requirements

### Requirement: Manipulation targets a projected node tree, not the live DOM directly

Direct manipulations SHALL mutate an in-memory projection of the rendered page (stable node
identities, props, text, children) and render optimistically, decoupling instant feedback from the
source write. The real source files remain the source of truth; the tree is a projection.

#### Scenario: An edit updates the tree instantly

- **WHEN** the user changes a node's style, text, or variant on the canvas
- **THEN** the projected node updates immediately and the change is visible without waiting on a
  source write or an AI run

#### Scenario: The projection matches the DOM

- **WHEN** the projection is built from the inspector bridge
- **THEN** it contains the same nodes, order, and identities as the live DOM (verified by a dev-only
  assertion before any write is routed through it)

### Requirement: Source writes are located by stable identity, not line:col

The background reconciler SHALL locate the JSX to edit by a node's stable identity
(fingerprint / class signature), using the `data-source` line:col only as a tiebreaker when the
identity matches more than one element. A positional line:col SHALL never be the sole driver of a
write.

#### Scenario: A stale anchor still writes the correct node

- **WHEN** an edit's captured line:col no longer points at the target element (a prior edit shifted
  lines, or the served stamp lagged)
- **THEN** the reconciler locates the element by identity and writes the correct node, or withholds
  when the identity can't be uniquely resolved — never editing the wrong node

#### Scenario: A burst reconciles without positional ordering

- **WHEN** a debounced burst includes a structural edit that shifts line numbers
- **THEN** every edit in the burst reconciles to the correct source node by identity, with no
  descending-line ordering required

### Requirement: The determinism boundary is surfaced on the node, not after an AI run

A node rendered from external data (a `.map`/conditional over props, state, or an API) SHALL be
marked as data-driven in the projection so the UI can explain why it isn't directly editable BEFORE
the user acts, instead of dead-ending in an AI reconcile message.

#### Scenario: A data-driven node is flagged up front

- **WHEN** the user selects or drags a node inside a `.map` over external data
- **THEN** the canvas indicates it's data-driven (edit the list/data, or use the assistant) rather
  than attempting a move that fails after an AI run
