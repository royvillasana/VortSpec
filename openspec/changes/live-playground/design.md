## Context

Three facts from the existing code shape everything below.

**A light page is one HTML document.** Light pages live at `.vortspec/light-pages/<name>.html`, framework-free, served over a local HTTP server and loaded into the canvas `<webview>`. One page is one document is one sync target. This is why the feature is tractable at all, and why framework pages are excluded: those render the project's dev server, and their edits are codemods into `.tsx` source. Syncing that is syncing source code between machines — a different problem with a different failure mode.

**Editing already mutates the live DOM.** `RunApp` applies an edit to the webview DOM immediately, then debounces `bridge.serializeDom()` → `liteWritePage()`. The live DOM is already the working source of truth; the file is a snapshot of it.

**That persistence model is the blocker.** Serialize-the-whole-document-and-overwrite is last-write-wins across the entire page. With five participants, whoever stops typing last erases everyone else — not as a race in some edge case, but as the normal outcome. This must change before anything else is worth building.

One more constraint from the existing code: edit anchors are `relPath:line:column` (`parseAnchor`). Under concurrent editing, line numbers drift as soon as anyone inserts or deletes, and a stale anchor points at the wrong element rather than failing. Position must stop being a synced value.

## Goals / Non-Goals

**Goals:**

- Two or more people on the same light page see each other's cursors, each other's edits, and how many of them are present.
- A comment can be written at the cursor, seen live by everyone, and posted into the existing repo-backed comment store.
- Concurrent edits converge; an edit to one element never discards an edit to another.
- With no relay configured, the Playground is exactly what it is today — no connection, no error, no degradation.
- The relay is the team's. VortSpec hosts nothing and sees nothing.

**Non-Goals:**

- Framework pages. Out of scope, and the spec says so normatively.
- Live collaboration anywhere but the Playground. The design system, Storybook, tokens, specs and manifests stay git-mediated — that is the user's explicit boundary, not an omission.
- Accounts, identity service, or presence across projects.
- Offline merge of *divergent long-lived* sessions. A CRDT converges concurrent editing; it is not a substitute for git for work that happened days apart.

## Decisions

### D1. Yjs, and sync the document tree — not the file, not the ops

Three candidates for what travels over the wire:

1. **The edit ops.** They already exist as a discriminated union (`attr`, `text`, `style`, `insert`, `delete`, `listRemove`, `listReorder`) with an anchor — tempting, because the shape is right there. Rejected: the anchor is `line:column`. Broadcasting ops means every client must re-derive positions after every remote op, which is operational transform, by hand, on a representation never designed for it.
2. **The file text.** A text CRDT over the HTML source. Works, but a character-level merge of markup can produce structurally invalid HTML from two individually valid edits.
3. **The document tree.** A CRDT whose unit is an element and an attribute.

**Chosen: (3), Yjs `Y.XmlFragment`.** It maps directly onto a DOM tree, which is what the Playground already manipulates, and it is the same primitive ProseMirror and Tiptap use for exactly this. Position becomes a derived property of the tree instead of a synced integer, which retires the anchor-drift problem rather than working around it. Yjs is the production default (~920k weekly downloads) with a mature awareness protocol and a provider interface that keeps the transport swappable.

*Alternative considered:* Automerge, whose git-like history would suit a spec-first product. Rejected for this surface: we do not need document branching here — git already provides it — and Yjs's XML type and awareness protocol are a closer fit to a live DOM.

### D2. Presence is awareness state, not documents

Cursors, names, colours, the current page, and the in-flight comment draft go in Yjs's **awareness** channel: ephemeral, replicated to peers, and dropped automatically when a client disconnects. Nothing about presence is ever written to the project, which is what makes "presence disappears on disconnect" true by construction rather than by cleanup code we have to get right.

The participant count is the size of the awareness map. Cursor positions are stored in **document space** (element + offset within the canvas coordinate system), not screen pixels, so a cursor points at the same element for a viewer at a different zoom — the overlay already applies that transform for selection boxes and comment pins.

### D3. Hocuspocus, self-hosted, and swappable

The relay is [Hocuspocus](https://tiptap.dev/blog/release-notes/hocuspocus-4-stable-release) — Yjs-native, stable since May 2026, self-hostable on Node/Bun/Deno/Cloudflare Workers, with awareness and persistence built in.

*Alternatives considered:*

- **`y-webrtc` (peer-to-peer).** The most ideologically appealing: document data flows directly between peers and can be encrypted with a shared secret, so a signaling server never sees content. Rejected as the default because WebRTC needs TURN to traverse strict and corporate NATs, and TURN is a relay you must run anyway — with worse failure modes. It demos beautifully and fails on precisely the networks these users work on.
- **Liveblocks / PartyKit (hosted).** Fastest to ship and operationally free. Rejected: a VortSpec-side service would see project content, contradicting the invariant the comments design was written to protect.

Because everything is built against Yjs's provider interface, P2P or hosted remain available later without rewriting the sync layer. **The provider is a seam, deliberately.**

### D4. Room identity comes from the git remote

The room is derived from the project's git remote plus the page name. "Same project" already means "same repo" to these users, and it requires no new registry, no IDs to exchange, and no way to accidentally join a stranger's session by guessing a name.

A project with no git remote gets no session, which is consistent: it also cannot share comments, push, or pull.

**Open:** whether the room id should be a hash of the remote rather than the remote itself, so a relay operator sees an opaque key instead of a repo URL. Leaning yes; it costs nothing.

### D5. Persist from converged state, and make the seam visible

`writeLightPage` writes a serialization of the **converged Yjs document**, not one client's DOM snapshot. This is the change that makes concurrent editing safe, and it is why `instant-canvas-edits` is modified rather than merely extended.

Two problems then need answering, and they are the ones most likely to bite:

- **Who writes.** If five clients debounce-write the same converged document, the file is written five times with identical content, and their git working trees churn. Proposal: the session elects a single writer (lowest client id, re-elected on disconnect); others rely on their own convergence and write on leaving. Every participant still ends with the correct file locally.
- **Live is not durable.** Edits propagate instantly but exist only in the relay and in participants' memory until someone persists and commits. A session where everyone closes their laptop without pushing is an afternoon lost. The spec requires the Playground to *show* unpersisted state; it should be hard to leave a live session without noticing.

### D6. Comments reuse the existing store, unchanged

An in-flight comment is awareness state. **Posting** it writes a thread through the existing `comment-store` and its anchor model, so it is committed, pushed, notified via GitHub, and visible to people who were never in the session — exactly like every other comment. Live comments are a faster way to *create* comments, not a second kind of comment.

### D7. Adoption is all-or-nothing, and a page we cannot reproduce exactly is not adopted

*Added while implementing group 1.* Modelling HTML means parsing it, and every parser normalises
something. If adoption reformatted a page, the first collaborative edit would land in git as a
whole-file diff — the page rewritten around one changed colour — and this product reviews everything
through git.

So the parser is source-faithful rather than spec-compliant: attribute order, the whitespace between
attributes, the quote character, boolean attributes, `<br>` vs `<br />`, comments and the doctype are
all preserved verbatim. A page is adopted only when `serialize(parse(html)) === html` byte for byte;
anything else — an omitted end tag, mis-nesting — is **refused**, and that page stays on today's
whole-document write. The worst case is that one page is not live. The alternative, guessing, is a
corrupted file in someone's repository.

All four real light pages on disk round-trip byte-identically. That they do is not luck: they were
written out by `serializeDom`, so they are already browser-normalised. A page a person hand-wrote is
the case that distinguishes a faithful implementation from one that merely regenerates canonical
attributes, and it is tested separately for exactly that reason.

### D8. The DOM is built from the document, and the two live in different packages

The guest DOM is constructed from the CRDT node by node rather than via `innerHTML`. Parsing markup
lets the HTML parser insert nodes nobody wrote — the implied `<tbody>` — and each one is a DOM node
with no CRDT counterpart, which is the misalignment that eventually sends an edit to the wrong
element. Building the tree ourselves makes the mapping 1:1 by construction.

The pure document model (`light-html`, `light-doc`) lives in `packages/core`; the DOM binding
(`light-dom-bind`) lives in `packages/ui`. That split is not cosmetic: `packages/core` compiles
without DOM types today, so a main-process file cannot reference `document` and still type-check —
and a main-process crash that types did not catch is exactly how v0.1.35 shipped unable to open a
window. Keeping the binding out of core preserves that.

### D9. Two constraints that only appeared once it was running

- **One peer seeds the page; everyone else receives it.** Two documents parsed independently from
  identical bytes are not replicas — they share no history, so merging them concatenates two copies
  of the page. Whoever opens the page first loads the file; every later participant syncs the
  document. This is a requirement on the session handshake in group 2, not an implementation detail.
- **Serialization must be deterministic across replicas.** Attributes an edit introduced arrive in
  whatever order updates happened to reach each peer, so map order differs per participant. Two
  people writing the same converged document would produce byte-different files, and the second to
  save would see a git diff nobody made. Added attributes are therefore ordered by name.

## Risks / Trade-offs

**This introduces a persistent outbound connection to a product whose defining promise is that it runs nothing.** → It is opt-in per project, connects only to a relay the team configures, is absent by default, and is visible while active. The spec makes "no relay → no connection, no error" normative. Being honest about this in the docs matters more than the implementation detail: the pitch becomes "your own Claude, your own GitHub, your own relay."

**The relay sees document content.** Hocuspocus is not end-to-end encrypted; a relay operator can read what is synced. → Acceptable when the team runs it, and no worse than the git host that already holds the same content. Must be *stated*, not assumed — someone will otherwise deploy it on a shared host and assume otherwise.

**Convergence is not correctness.** A CRDT guarantees everyone ends with the same tree, not that the tree is what anyone wanted. Two people restyling the same element converge on one winner and the other's intent is silently gone. → Cursors and selection make concurrent work visible enough to avoid, which is how Figma solves it. Do not add locking.

**The webview boundary.** Remote edits must apply to the guest DOM through the existing bridge, and the bridge is the app's most fragile seam — a rendering crash there is reported as a selector error rather than as itself (see `apps/ide/tests/ct/README.md`). → Expect debugging cost here and instrument early.

**Scope creep to framework pages.** "Live works on light pages" invites "why not the real app?" → The answer is in the spec normatively so it is a decision to revisit, not an omission to fill in.

## Migration Plan

Additive. No project file changes format; a project without relay configuration is untouched.

The one non-additive change is light-page persistence, and it is safe in both directions: writing from converged state produces the same file a snapshot would when only one person is editing.

Sequence matters more than usual, because each step is independently sheddable if the next proves wrong:

1. **CRDT-backed document, single-user.** No network. Valuable alone: real undo, and no clobbering between two windows on the same page.
2. **Awareness only** — cursors, names, count. No document sync. Ships the visible half and proves the transport on real networks before anything depends on it.
3. **Document sync.**
4. **Comment on cursor.**
5. **The persistence seam** — writer election, unpersisted-state indication.

Rollback at any step is removing the provider; the CRDT document works offline by design.

## Open Questions

- **Where is the relay URL configured?** It is a team-level fact, so the project seems right (committed, everyone gets it) — but a URL with a token in it must not be committed. Likely: URL in the project, credentials per user.
- **Authentication to the relay.** Anyone with the room id can currently join. Options: a shared secret in per-user config, or the relay validating against the git host. The second is more work and much better, since it makes repo access the source of truth for session access.
- **Does the writer need to be the person who commits?** Persisting produces a working-tree change on one machine. If the elected writer is not the one who intends to push, the change lands on the wrong laptop.
- **Interaction with the background component build.** The auto-build agent writes files while a session may be live on a page that reads them. Unclear whether that can produce a surprising remote update.
