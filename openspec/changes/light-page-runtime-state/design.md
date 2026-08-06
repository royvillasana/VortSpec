## Context

Three facts set the shape of this.

**A light page's source is its DOM.** `RunApp` applies an edit to the guest DOM immediately, then a debounced `serializeDom()` writes the whole file. There is no other representation of the page, which is what makes framework-free editing possible at all.

**Light pages can contain scripts.** The composer prompt permits "semantic HTML + inline styles (or a scoped `<style>`)" and framework-free JS, and real pages use it — `data-island` controls, carousels, video toggles. So the DOM diverges from the file the moment the page runs, before anyone edits anything.

**Nothing currently distinguishes those two kinds of divergence.** `serializeDom` clones the live document and strips only the canvas's own instrumentation (`data-vs*`, `contenteditable`, overlays, injected styles). Everything else is written back as authored source. The live-playground CRDT binding has the same blind spot from the other direction: its `MutationObserver` records every mutation, so script-driven ones enter the document as ordinary edits.

Both paths therefore produce the same bug, and a fix in one of them is not a fix.

## Goals / Non-Goals

**Goals:**

- A save contains the page's authored markup plus the edits made to it, and nothing else.
- The rule is about where a change came from, not what it looks like.
- A deliberate edit to a state-ish attribute is saved; the same attribute moved by a script is not.
- Nothing changes about when a save fires, or about editing feeling instant and gate-less.

**Non-Goals:**

- Framework pages. Their edits are codemods into source; no DOM is ever serialized.
- Repairing pages that already carry baked-in runtime state.
- Preventing light pages from having scripts, or "resetting" a page before saving.
- Guaranteeing correctness for a script that mutates the DOM synchronously inside an edit — see the risks.

## Decisions

### D1. Provenance, not inspection

The alternative was an allowlist of attributes that count as runtime state — `aria-pressed`, `aria-expanded`, `open`, `checked`, `value`, and so on. Rejected, for a reason worth stating plainly: it is wrong in both directions and cannot be made right. A page whose *authored* markup sets `aria-expanded="true"` on an accordion would have that edit silently refused; a page that tracks state in `class` or `style` or `data-*` would sail straight through. The list would grow forever and still be a guess about somebody else's page.

**Chosen: a mutation is authored if the canvas caused it, and runtime otherwise.** The canvas already applies every edit through known entry points — `applyOverride`, `setText`, `setClass`, the drag-move, insert and delete. Each of those brackets its own DOM work, and only mutations observed inside that bracket are recorded.

The property this buys is the one that matters: the rule never has to know what an attribute *means*. A user changing `aria-pressed` in the panel is an edit; a click handler changing it is not; and the same is true of an attribute nobody has thought of yet.

### D2. The bracket is `takeRecords()`, not a flag

A boolean "we are editing now" flag does not work, because `MutationObserver` delivers on a microtask — records arrive after the flag is cleared, and the two cannot be told apart afterwards.

`observer.takeRecords()` is synchronous and drains the queue, so it can be used to cut the stream at exact points:

1. Before applying an edit, drain and **discard** — anything queued is script activity from before this edit.
2. Apply the edit.
3. Drain again and **record** — these are the edit's own mutations.

Everything the observer delivers on its normal async schedule is, by construction, not from an edit.

This inverts the current default. Today every mutation is recorded and the canvas's own instrumentation is filtered out by name; afterwards nothing is recorded unless an edit produced it, and the instrumentation filter becomes a second line of defence rather than the only one.

### D3. Both write paths, or neither

`serializeDom` (today's path, and the fallback in live-playground) and the CRDT binding must agree, or the bug simply moves to whichever path is taken. Two options:

1. **The CRDT becomes the only light-page save path.** It is already seeded from the file, so with D2 it holds authored content by construction and `docToLightHtml` is correct with no further work. But it makes saving depend on adoption succeeding, and a page that cannot be modelled exactly has no save path at all.
2. **`serializeDom` learns the same distinction** by diffing the live DOM against the authored document and keeping the authored value wherever no edit was recorded.

**Leaning (1), with today's `serializeDom` retained only for pages that cannot be adopted** — accepting that those pages keep the current behaviour, and saying so, rather than maintaining two implementations of one rule. This is the decision most worth challenging in review.

### D4. An excluded edit is worse than an included artefact

The failure mode this introduces is the more dangerous one. An unwanted `aria-pressed` in a diff is visible and annoying; an edit that silently does not save is invisible and destroys work. The current bug at least errs toward keeping too much.

So the implementation is required to be *observably* complete rather than presumed so: every edit entry point gets a test that its mutation is recorded, and the list of entry points is derived from the guest's command handler rather than from memory. A new edit type that forgets to bracket itself must fail a test, not lose a user's work.

## Risks / Trade-offs

**A script that mutates during an edit is misattributed.** If an edit triggers a handler that changes something else synchronously, that change lands inside the bracket and is saved. → Accepted: it is rare, it errs toward keeping too much (the safer direction), and the alternative is attributing by name, which fails constantly.

**Pages that cannot be adopted keep the bug** under D3 option 1. → They are also the pages the live document already refuses, so the set is known and can be reported rather than discovered.

**Existing files carry state already baked in.** → Left alone deliberately; a rewrite of someone's markup is the thing this change exists to prevent. It comes out on the next edit to that element, or by hand.

**This makes the DOM no longer literally the source.** The mental model becomes "the file, plus your edits" rather than "whatever is on screen". → That is already the user's model — nobody thinks pressing play is an edit — and the current behaviour is the surprise.

## Open Questions

- **Does an edit that a script then reverses stay saved?** The user drags an element, a layout script snaps it back. The edit was authored, so it saves; the page will not show it on reload. Correct, or a bad surprise?
- **Should the app show what it excluded?** A count would make the rule visible and catch a misattributed edit early, but risks becoming noise on any page with an animation.
- **What about `<style>` or `class` changes a script makes for animation?** They are runtime by this rule and correctly excluded, but they are also the changes most likely to look like a lost edit to someone watching the canvas.
