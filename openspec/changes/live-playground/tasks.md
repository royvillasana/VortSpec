> **Each group is independently sheddable.** Group 1 is worth shipping alone. Group 2 proves the transport on real networks before anything depends on it. If group 2 goes badly, nothing after it is committed to.

## 1. Make the light-page document mergeable (no network)

- [x] 1.1 Model a light page as a Yjs document (`Y.XmlFragment`), and write a round-trip test: HTML → CRDT → HTML is byte-identical for a set of real `.vortspec/light-pages/*.html` fixtures
- [x] 1.2 Build the two-way CRDT↔DOM binding: local DOM mutations produce CRDT ops, CRDT ops apply to the DOM. Both directions, no echo loop
- [x] 1.2b Wire that binding into the guest preload and the host bridge. Split out from 1.2: the binding is verifiable in isolation, the wiring is not — it touches the webview, which is the app's most fragile seam (a rendering crash there is reported as a selector error), so it needs the app running to verify rather than a green test
- [x] 1.3 Change `writeLightPage` to serialize from converged state instead of `bridge.serializeDom()`
- [x] 1.4 Prove the property the whole feature rests on: two documents editing *different* elements concurrently converge with both edits present — and the same test against today's snapshot-write to show it fails there
- [x] 1.5 Verify single-user editing is unchanged: instant edits, undo, and persistence behave exactly as before, with the existing CT suites green

## 2. Awareness only — cursors, names, count (no document sync)

- [x] 2.1 Stand up a Hocuspocus relay for development; document how a team self-hosts it (not shipped in the app)
- [x] 2.2 Derive the room id from the git remote + page name; decide hash-vs-plain (design D4) and record the choice
- [ ] 2.3 Join/leave a session on light-page open/close; never for framework pages
- [ ] 2.4 Publish cursor position in **document space**, plus name and colour from the profile
- [ ] 2.5 Render remote cursors on the existing canvas overlay so they track the canvas transform — verify a cursor points at the same element at two different zoom levels
- [ ] 2.6 Show the participant count in the Playground header
- [ ] 2.7 Verify presence lifecycle: a disconnect removes the cursor and decrements the count; nothing about presence is ever written to the project
- [ ] 2.8 **Test on a real corporate/VPN network, not just localhost.** This is the step that decides whether the transport choice survives

## 3. Live document sync

- [ ] 3.1 Connect the CRDT document to the provider; remote ops apply to the guest DOM
- [ ] 3.2 A late joiner receives the current document, including edits made before they joined
- [ ] 3.3 Verify convergence with concurrent edits from 3+ clients, including insert/delete (the ops most likely to break tree merges)
- [ ] 3.4 Confirm the anchor-drift class of bug is gone: concurrent inserts above an element do not misdirect a later edit to it
- [ ] 3.5 Verify an edit to one element never discards a concurrent edit to another — the spec's load-bearing claim

## 4. Comment on the cursor

- [ ] 4.1 Compose a comment at the cursor; broadcast the draft as awareness so others see it under that cursor
- [ ] 4.2 Post it through the existing `comment-store`, anchored to its element — no second comment format
- [ ] 4.3 An abandoned draft leaves no thread and disappears for others
- [ ] 4.4 Verify a posted comment behaves like any other afterwards: commits, pushes, notifies via GitHub, visible to someone who was never in the session

## 5. The persistence seam

- [ ] 5.1 Elect a single writer per session (design D5); re-elect on disconnect
- [ ] 5.2 Every participant ends with the correct file locally, including one who leaves mid-session
- [ ] 5.3 Indicate in the Playground when a session has edits not yet written to the project file
- [ ] 5.4 Answer the open question from design: whether the elected writer is the right person to hold the working-tree change, and make the answer visible in the UI

## 6. Degradation and disclosure

- [ ] 6.1 No relay configured → no connection attempted, no error, Playground identical to today
- [ ] 6.2 Relay unreachable → editing continues; the app says the session is unavailable and why
- [ ] 6.3 Connection lost mid-session → keep editing locally, tell the participant they are no longer live, lose nothing
- [ ] 6.4 Verify with a network trace that a default install with no configuration connects to no collaboration host
- [ ] 6.5 Document plainly that a self-hosted relay **can read synced document content** — someone will otherwise put it on a shared host assuming otherwise
- [ ] 6.6 Update the product's local-first claims to say "your own Claude, your own GitHub, your own relay" rather than implying nothing is ever connected

## 7. Verify end to end

- [ ] 7.1 Full workspace `check-types`, unit tests, and the IDE CT suite green
- [ ] 7.2 A real multi-machine session: 3+ participants, cursors, concurrent edits, a posted comment, then persist → commit → push → another participant pulls and sees the same page
- [ ] 7.3 `/opsx:sync live-playground`, then archive
