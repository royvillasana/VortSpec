## Why

A light page's source is its DOM. That decision is what makes the Playground work without a framework — an edit mutates the live page, and saving serializes it back to the `.html`. It is the right decision, and this change does not undo it.

But it does not distinguish between the two reasons a DOM can differ from its file. One is *the user edited something*. The other is *the page ran*.

Observed on a real page, in a real save. Dragging one heading into a new position produced this diff:

```
- <button class="hero__motion" type="button" data-island="hero-video-toggle" aria-pressed="false">
+ <button class="hero__motion" type="button" data-island="hero-video-toggle" aria-pressed="true">
-       <span data-label="">Pause background video</span>
+       <span data-label="">Play background video</span>
```

Nobody edited that button. It is a video play/pause control, and its own script had toggled it. Half the diff for "I moved a heading" is the page's runtime state, written into its source as though it were authored.

The failure gets worse with time rather than better. `Animated-carousel-card` is a page in the same project: if a carousel advances on a timer, every save bakes in whichever slide happened to be showing, and a *different* one each time — so unrelated edits produce a churning file, and the version in git slowly drifts to whatever state the page was left in.

It also runs in one direction only. Saving runtime state is silent and cumulative; nothing ever removes it, so each save is a new floor.

## What Changes

- **A save writes what was edited, not what is displayed.** Provenance replaces inspection: a mutation the canvas caused is authored and is written; a mutation the page's own script caused is runtime and is not.
- **This retires the question of which attributes "look like" state.** An `aria-pressed` the user deliberately changed in the panel is an edit and is saved; the same attribute toggled by a click handler is not. Attribute names never enter into it, which matters because any list of them would be wrong for somebody's page.
- **Nodes a script created are excluded too** — a carousel cloning its slides, a script appending a tooltip — on the same rule, without needing a separate one.
- **Existing pages are not repaired automatically.** Files that already carry baked-in runtime state keep it until someone edits it out; a silent rewrite of a page's markup is exactly the kind of diff this change exists to prevent.

Explicitly **not** in scope: framework pages (their edits are codemods into `.tsx` and never serialize a DOM), deciding whether light pages ought to contain scripts at all, and any change to when a save fires.

## Capabilities

### Modified Capabilities
- `instant-canvas-edits`: persistence for a light page changes from "serialize the live DOM" to "serialize the authored document" — the file plus the edits made to it. The optimistic, gate-less, debounced character of editing is unchanged.

## Impact

| Area | Change |
|---|---|
| `apps/ide/src/preload/guest.ts` | Edits become the only recorded source of change: each entry point marks its own mutations as authored |
| `packages/ui/src/lib/light-dom-bind.ts` | Records mutations only from an authored window (live-playground's binding, where the CRDT is already seeded from the file) |
| `packages/ui/src/lib/useInspectorBridge.ts` | `serializeDom` stops being the light-page save path, or learns the same distinction |
| `packages/ui/src/views/RunApp.tsx` | No change to when a save fires — only to what it contains |

**This has a real chance of excluding a genuine edit**, which is worse than including runtime state: a lost edit is invisible, while an unwanted attribute is at least in the diff. The rollout must therefore be able to show what was excluded and why, and the tests must cover every edit entry point rather than a sample.
