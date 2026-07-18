## ADDED Requirements

### Requirement: A selected element can be dragged into a valid layout slot

In inspect mode the user SHALL be able to drag the selected element (and its node subtree) and drop it into a valid layout slot, snapping to the structural model's drop zones. While dragging, the canvas SHALL draw the insertion line at the target slot and a ghost of the dragged element. The drop SHALL respect the layout — it lands in a real row/column slot, never at a free x/y position — and SHALL be refused when it belongs to no container.

#### Scenario: Dragging shows the target slot and a ghost

- **WHEN** the user drags the selected element over a valid slot
- **THEN** an insertion line SHALL be drawn at that slot
- **AND** a ghost of the dragged element SHALL follow the pointer

#### Scenario: A drop outside any container is refused

- **WHEN** the user releases the drag over a position that belongs to no layout container
- **THEN** no move run SHALL start
- **AND** the canvas SHALL indicate the drop was not a valid slot

### Requirement: A move relocates JSX in source under the gated accept discipline

Dropping SHALL run a gated Claude Code step that removes the element's JSX from its origin and re-inserts it at the destination, written as a single marker-delimited option scaffold, previewed via hot reload, and accepted or discarded. A snapshot SHALL be taken over every file the move may touch before any write; discard SHALL restore it exactly. The run SHALL refuse to write into a generated/ignored file and SHALL stop rather than edit a file outside the snapshot set. Committing SHALL stay blocked while the move scaffold is live.

#### Scenario: Discarding a two-file move restores both files

- **WHEN** a move edits an origin file and a destination file and the user discards
- **THEN** both files SHALL be restored byte-identical to before the run

#### Scenario: An ambiguous origin or destination stops the run

- **WHEN** the move's origin or destination anchor resolves to more than one source location
- **THEN** the run SHALL stop with the candidates and a human sentence, having written nothing to an arbitrary one

#### Scenario: Accept leaves no scaffold

- **WHEN** the user accepts a move
- **THEN** the relocated element SHALL remain in source and no scaffold marker SHALL remain
