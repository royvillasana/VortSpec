## ADDED Requirements

### Requirement: A live session is scoped to one light page in the Playground

The app SHALL join a live session when a light page is opened in the Playground and a relay is configured for the project. The session SHALL be identified by the project's git remote together with the page, so that two people with the same project on the same page share a session and people on different pages do not. Leaving the page or closing the Playground SHALL leave the session.

Framework pages SHALL NOT join a session.

#### Scenario: Two people on the same page share a session

- **WHEN** two participants with the same project open the same light page in the Playground
- **THEN** they are in the same session and can see each other

#### Scenario: Different pages are different sessions

- **WHEN** two participants open different light pages of the same project
- **THEN** they are in separate sessions and do not see each other's cursors or edits

#### Scenario: A framework page is never live

- **WHEN** a participant opens a framework page in the Playground
- **THEN** no session is joined and the page behaves exactly as it does today

### Requirement: Participants see each other's cursors and a live count

While in a session, the Playground SHALL render every other participant's cursor position on the canvas overlay, labelled with that participant's name and a stable per-participant colour, tracking the canvas transform so a cursor points at the same element regardless of each viewer's zoom or viewport. The Playground SHALL display how many participants are currently in the session.

Cursor position and presence SHALL be ephemeral: never written to the project, and removed when a participant disconnects.

#### Scenario: A cursor points at the same element for everyone

- **WHEN** one participant moves their cursor over an element and another participant is viewing at a different zoom or viewport size
- **THEN** the rendered cursor points at that same element rather than at the same screen coordinates

#### Scenario: The count reflects who is actually present

- **WHEN** a participant joins or leaves the session
- **THEN** the participant count updates for everyone remaining

#### Scenario: A disconnect removes presence

- **WHEN** a participant's connection drops
- **THEN** their cursor disappears for the others and the count decreases, without their edits being reverted

#### Scenario: Presence is never persisted

- **WHEN** a session ends
- **THEN** no cursor or presence data has been written to the project

### Requirement: Edits propagate live and converge

An edit made by any participant — moving, resizing, restyling, inserting, deleting, or editing text — SHALL appear for every other participant in the session without either of them saving. Concurrent edits by different participants SHALL converge to the same document for everyone, and an edit to one element SHALL NOT discard a concurrent edit to a different element.

#### Scenario: An edit appears for everyone

- **WHEN** one participant changes an element's style
- **THEN** the change appears on every other participant's canvas

#### Scenario: Concurrent edits to different elements both survive

- **WHEN** two participants edit two different elements at the same time
- **THEN** both edits are present for both of them

#### Scenario: The document converges

- **WHEN** participants edit concurrently and then all activity stops
- **THEN** every participant sees an identical document

#### Scenario: A late joiner receives the current document

- **WHEN** a participant joins a session that is already in progress
- **THEN** they see the document as it currently stands, including edits made before they joined

### Requirement: A comment can be written at the cursor and posted to the repo

A participant SHALL be able to write a comment at their cursor position. While being written, it SHALL appear beneath that participant's cursor for every other participant. Posting it SHALL create a thread in the project's existing repo-backed comment store, anchored to the element it was placed on, so it outlives the session and is visible to people who were never in it.

Abandoning an unposted comment SHALL leave nothing behind.

#### Scenario: Others see the comment being written

- **WHEN** a participant is typing a comment at their cursor
- **THEN** the other participants see it under that participant's cursor

#### Scenario: A posted comment becomes a durable thread

- **WHEN** a participant posts a comment
- **THEN** it is stored as a thread in the project's comment store, anchored to its element, and behaves like any other comment thereafter

#### Scenario: An abandoned draft leaves nothing

- **WHEN** a participant dismisses a comment without posting it
- **THEN** no thread is created and it disappears for the other participants

### Requirement: A session's edits are durable only once persisted

Live propagation SHALL NOT be mistaken for durability. The Playground SHALL make it visible when a session's document has changes that are not yet written to the project file, and SHALL persist the converged document to the light page file so the change can be committed and pushed like any other.

#### Scenario: Unpersisted work is visible as such

- **WHEN** a session has edits that are not yet written to the project file
- **THEN** the Playground indicates this rather than presenting the work as saved

#### Scenario: The file reflects converged state

- **WHEN** the session's document is persisted
- **THEN** the light page file contains the converged result of every participant's edits, not one participant's snapshot of it

### Requirement: Absent or unreachable relay degrades to today's behaviour

A live session SHALL be optional. When no relay is configured for a project, or the relay cannot be reached, the Playground SHALL behave exactly as it does without this feature: edits are local, persistence works, and nothing is blocked. The app SHALL say which of the two is the case rather than failing silently or presenting an error the user cannot act on.

A relay SHALL only ever be one the team configures. The app SHALL NOT connect to any collaboration service by default.

#### Scenario: No relay configured

- **WHEN** a project has no relay configured
- **THEN** the Playground works exactly as it does today, with no connection attempted and no error shown

#### Scenario: Relay unreachable

- **WHEN** a relay is configured but cannot be reached
- **THEN** editing continues locally and uninterrupted, and the app says the session is unavailable and why

#### Scenario: Connection lost mid-session

- **WHEN** the relay connection drops during a session
- **THEN** the participant keeps editing locally, is told they are no longer live, and their work is not lost

#### Scenario: No default service

- **WHEN** the app is installed and a project is opened without configuration
- **THEN** no collaboration connection is made to any host
