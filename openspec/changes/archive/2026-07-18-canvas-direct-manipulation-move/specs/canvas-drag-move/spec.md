## MODIFIED Requirements

### Requirement: A move relocates JSX in source under the gated accept discipline

Dropping SHALL move the element **in the live DOM immediately** (an ephemeral
reparent into the target slot, no source write and no agent run), and offer the
user **Keep** or **Revert**. Reverting SHALL re-insert the element at its origin
with nothing written. Keeping SHALL run a gated Claude Code step that removes the
element's JSX from its origin and re-inserts it at the destination — snapshotted
over the source scope before any write, written as a single marker-delimited
option scaffold, then accepted — and reload so source matches the moved DOM. The
ephemeral reparent SHALL be re-applied across an app re-render until Keep reloads
real source. The run SHALL refuse to write into a generated/ignored file and
SHALL stop rather than edit a file outside the snapshot set. Committing SHALL stay
blocked while the move scaffold is live.

#### Scenario: A drop moves the element instantly, before any agent runs

- **WHEN** the user drops the dragged element on a valid slot
- **THEN** the element SHALL appear in the new slot in the live DOM immediately
- **AND** no source file SHALL be written and no agent run SHALL start until the user keeps the move

#### Scenario: Revert undoes the move with nothing written

- **WHEN** the user reverts an instant move
- **THEN** the element SHALL return to its origin slot in the live DOM
- **AND** no source file SHALL have been written

#### Scenario: Keep reconciles source to the moved DOM

- **WHEN** the user keeps an instant move
- **THEN** a gated run SHALL relocate the element's JSX in source and be accepted
- **AND** no scaffold marker SHALL remain after it completes

#### Scenario: An ambiguous origin or destination stops the keep

- **WHEN** the kept move's origin or destination anchor resolves to more than one source location
- **THEN** the run SHALL stop with the candidates and a human sentence, having written nothing to an arbitrary one
- **AND** the element SHALL remain in its moved position pending Revert
