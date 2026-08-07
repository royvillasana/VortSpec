## Why

Design review in VortSpec is asynchronous. The 2026-07-11 comments work made that deliberate — comments are files, sync is `git push`, notification rides on the user's own GitHub — because *"VortSpec is local-first and stores no VortSpec-side accounts or servers, so the comment system must not introduce one."*

That model is right for specs, tokens, components and manifests: they are reviewed, approved, and merged. It is wrong for the Playground. Composing a screen is the one activity where two people want to be **in the same room at the same time** — pointing at a thing, moving it, and seeing the result together. Today the second person watches a screen-share and describes what to click.

This adds live multiplayer to **the Playground only**. Everything else keeps the git model unchanged: the design system, Storybook, tokens and specs are still edited locally and shared through GitHub.

**It requires an always-on relay, which git cannot provide.** That is a real departure from the invariant the comments design was written to protect, so the relay is **self-hosted by the team, never by VortSpec** — the same shape as "your own Claude, your own GitHub". A project with no relay configured behaves exactly as it does today.

## What Changes

- **A live session on a light page.** Opening a light page in the Playground joins a session keyed to the project and page. Everyone on that page sees the same document.
- **Cursors and presence.** Each participant's cursor renders on the existing canvas overlay with their name and colour. A live participant count shows in the Playground header. Presence disappears on disconnect — it is never persisted.
- **Live edits.** Moving, resizing, restyling, inserting and deleting propagate to every participant in the session as they happen, not on save.
- **Comment on the cursor.** A participant can type a comment at their cursor position and have it appear under their cursor for everyone, Figma-style. Posting it writes a real thread into the existing repo-backed comment store, so it survives the session and reaches people who were not in it.
- **BREAKING (internal): light-page persistence stops being a whole-document overwrite.** Today an edit mutates the live DOM and a debounced `serializeDom()` writes the entire file. With more than one editor that is last-write-wins across the whole page — the person who stops typing last silently erases everyone else. The document becomes a CRDT; the file is written from converged state.
- **A session becomes a commit.** Live edits are shared instantly but are not shared *durably* until someone persists and pushes. The Playground makes that seam explicit rather than leaving people to discover that their afternoon lived only in a relay.

Explicitly **not** in scope: framework pages (the dev-server route, where edits are TSX codemods — syncing source code is a different problem), live collaboration anywhere outside the Playground, VortSpec-hosted infrastructure, accounts, or any telemetry.

## Capabilities

### New Capabilities
- `live-playground`: joining and leaving a live session, cursor and presence rendering, the participant count, live edit propagation, comment-on-cursor, and the degradation path when no relay is configured or reachable.

### Modified Capabilities
- `instant-canvas-edits`: light-page persistence changes from "serialize the whole document and overwrite" to "write from converged CRDT state". The optimistic, gate-less, debounced character of editing is unchanged — this narrows *what* a write may clobber.

## Impact

| Area | Change |
|---|---|
| `packages/core` | New session module: Yjs document per page, relay provider, awareness. Room identity derived from the git remote + page name |
| `packages/ui` (`RunApp`, `RunCanvas`) | Remote cursors on the existing overlay; participant count; comment-on-cursor composer; edits applied from remote as well as local |
| `packages/core/src/main/lite` | `writeLightPage` writes from converged state rather than a serialized snapshot |
| Comment store | Reused unchanged as the durable home for posted comments |
| Config | A relay URL per project, plus the participant's display identity (already in the profile) |
| New dependency | `yjs` + a provider. The relay itself is a separate self-hosted service, not shipped in the app |

**Networking is new surface area.** Today the app talks to localhost, the user's git remote, and Anthropic. This adds a persistent connection to a relay the team runs. It must be opt-in per project, obvious when active, and harmless when absent.
