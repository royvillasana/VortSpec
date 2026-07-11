# run-canvas-comments Specification

## Purpose
TBD - created by archiving change run-canvas-comments. Update Purpose after archive.
## Requirements
### Requirement: Comment mode anchors a comment to a rendered section

The Run Canvas SHALL offer a **Comment mode** alongside Inspect and Interact. In Comment mode, clicking a rendered section SHALL create a comment thread anchored to that element via the **stable node-identity fingerprint** (Run-Canvas Phase 1) plus a captured thumbnail, human label, last-seen rect, and app route. Anchoring SHALL read only the rendered DOM — no cooperation from the previewed app.

#### Scenario: Drop a comment on a section

- **WHEN** the user is in Comment mode and clicks a rendered element
- **THEN** a new comment thread SHALL be created anchored to that element (fingerprint + thumbnail + label) and a composer SHALL open

#### Scenario: Anchor survives a re-render

- **WHEN** a comment is anchored and the previewed app re-renders (HMR or DOM mutation)
- **THEN** the pin SHALL re-acquire the same logical element via its fingerprint and stay on it

#### Scenario: Lost anchor degrades, never vanishes

- **WHEN** an anchor's fingerprint no longer resolves (element removed, different app state)
- **THEN** the thread SHALL appear as **unanchored** with its stored thumbnail, label, and route, and SHALL NOT be silently dropped

### Requirement: Comment pins, threads, and resolution

Existing comment pins SHALL render on the canvas overlay using the same transform as the selection overlay so they track the anchored element at any zoom/pan. Clicking a pin SHALL open a thread showing the messages (rendered as Markdown), a reply composer, and Resolve/Reopen. Resolved threads SHALL dim their pin. Threads and replies SHALL be append-only.

#### Scenario: Open and reply to a thread

- **WHEN** the user clicks an existing pin
- **THEN** the thread SHALL open with its messages and a composer, and a reply SHALL append a new message to the thread

#### Scenario: Resolve and reopen

- **WHEN** the user resolves a thread
- **THEN** the pin SHALL show as resolved (dimmed) and be filterable as resolved, and the user SHALL be able to reopen it

### Requirement: Comments never write to source

Creating, replying to, or resolving a comment SHALL NOT modify any project source file. Comment data SHALL be written only through the `comment-store` capability (under `.vortspec/comments/`). The spec-first code gate SHALL be unaffected.

#### Scenario: Commenting touches no source

- **WHEN** the user creates or replies to a comment
- **THEN** no file outside `.vortspec/comments/` SHALL be written by the comment path

