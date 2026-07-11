# comment-store Specification

## Purpose
TBD - created by archiving change run-canvas-comments. Update Purpose after archive.
## Requirements
### Requirement: Comments are plain per-thread files in the project repo

Comment threads SHALL be stored as one JSON file per thread under `.vortspec/comments/<thread-id>.json` in the project repository, so they travel with the project via Git and are visible to a teammate on `git pull`. All reads and writes SHALL resolve strictly inside `.vortspec/comments/` (workspace-root guard); a path that escapes SHALL be rejected. Messages within a thread SHALL be append-only.

#### Scenario: A comment is stored as a repo file

- **WHEN** a comment thread is created
- **THEN** it SHALL be written to `.vortspec/comments/<thread-id>.json` within the project, and reading the store SHALL return it

#### Scenario: Store rejects path traversal

- **WHEN** a store operation is given a thread id or path that escapes `.vortspec/comments/`
- **THEN** the operation SHALL be rejected and nothing outside that directory SHALL be read or written

#### Scenario: Appending a reply does not clobber the thread

- **WHEN** a reply is added to an existing thread
- **THEN** the new message SHALL be appended and the prior messages SHALL be preserved

### Requirement: Comments sync through the existing Git layer

Posting or resolving a comment SHALL stage and commit **only** the affected comment file (never the user's other working changes), through the existing Git integration. A **Share** action SHALL push the comment commits; pulling is the user's normal Git pull. When the project has no Git remote, comments SHALL still save locally and the UI SHALL explain that sharing needs a remote — without error.

#### Scenario: Posting commits only the comment file

- **WHEN** the user posts a comment
- **THEN** exactly the one `.vortspec/comments/<thread-id>.json` file SHALL be staged and committed, and no other working changes SHALL be staged

#### Scenario: No remote degrades gracefully

- **WHEN** the project has no Git remote and the user posts a comment
- **THEN** the comment SHALL save and commit locally, and Share SHALL surface a fix-it that a remote is required — never a raw error

