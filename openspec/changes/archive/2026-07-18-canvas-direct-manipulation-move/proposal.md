# Direct-manipulation move (instant live-DOM reparent, deferred reconcile)

## Why

The drag-move shipped in `canvas-live-structural-editing` §5 runs a Claude Code
step on every drop before the user sees any result — the element doesn't move
until the AI rewrites the JSX. That inverts the Figma loop the product is after:
manipulation should be instant and the AI should reconcile *after* the user has
decided, not gate the feedback.

The live rendered DOM in the canvas already *is* a manipulable reflection of the
app (the inspector already applies ephemeral style/class/text overrides for
instant feedback). Structural moves simply haven't joined that pattern.

## What changes

Drag-move becomes ephemeral-first, mirroring the inspector's existing
"ephemeral edit → gated Keep/Revert" discipline:

1. **Drop reparents the real element in the live DOM immediately** (0 ms, no AI).
   The guest remembers the origin so it can undo.
2. The panel offers **Keep** or **Revert** on the already-moved element.
   - **Revert** re-inserts the element at its origin — instant, nothing written.
   - **Keep** runs the same gated move run (cut+re-insert the JSX, snapshotted,
     marker-scaffolded) and auto-accepts it, then reloads so source matches.
3. The ephemeral reparent is re-applied across an app re-render/HMR (like the
   other overrides), and dropped once Keep reloads real source.

Non-goals: free x/y placement, multi-select, and live resize/spread (resize
already works via the inspect handles; spread is future). This is the move loop
only.
