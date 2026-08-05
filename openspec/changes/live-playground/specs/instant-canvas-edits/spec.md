## MODIFIED Requirements

### Requirement: Persistence to source is background, debounced, dirty-scoped, single-flight

Deterministic source writes SHALL happen in the background without blocking the edit loop: coalesced/debounced, scoped to only the changed elements/files, with at most one write in flight plus one queued follow-up. The user SHALL continue editing while a write is pending.

For a light page, the write SHALL be derived from the page's converged document state and SHALL NOT overwrite the file with one client's serialized snapshot of the whole page. Snapshot-and-overwrite is safe only while exactly one person can be editing; it discards concurrent work by construction, and the Playground can no longer assume that.

#### Scenario: Rapid edits collapse into one write
- **WHEN** the user makes several edits in quick succession
- **THEN** they are coalesced and persisted as a scoped background write, and the UI never blocks waiting on it

#### Scenario: A write failure is surfaced without losing the visual edit
- **WHEN** a background source write fails
- **THEN** the optimistic visual edit is retained and the failure is surfaced as a fixable notice, not a silent drop

#### Scenario: A light-page write cannot clobber a concurrent edit
- **WHEN** a light page is written while another participant has edited a different element
- **THEN** the file contains both edits, because the write is derived from converged state rather than from one client's whole-document snapshot
