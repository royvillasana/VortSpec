# Node-tree projection — real Instatic parity for the Playground

## Why

The original ask was "make the Playground work the way Instatic does." We shipped the *feel*
(instant, no gate, background persistence) but not the *architecture*, and the design review (DR-1)
traced most of this session's pain to that gap.

**Instatic owns an in-memory JSON node tree.** It mutates that tree instantly (Zustand + Mutative),
renders per-node memoized islands, and publishes to source on a debounce. Everything is materialized
in the tree, so **every structural op is a pure, always-deterministic tree op** — there is no
"external data" and no ambiguity, and node identities are stable.

**VortSpec instead edits the user's real source via positional AST codemods**, using the live DOM
overlay as its fast representation. That is a *stronger* product stance (real-code fidelity, no
lock-in), but the current implementation pays for it repeatedly:

- **Positional `data-source` anchors are brittle.** They shift on every edit and go stale (the
  stamp-offset saga, RT-3 burst corruption). We patched with descending-line ordering (RT-3),
  identity re-location (DR-2), polling, and flush-before-move — a pile of mitigations around a
  fragile core.
- **Determinism is only partial.** Mapped / props / state / API-driven UI has no local literal to
  edit, so we fall back to AI — which Instatic never needs. "Same as Instatic" is architecturally
  out of reach while the fast representation is the DOM and the write path is line:col.
- **Granularity is coarse.** We lean on Vite HMR (per-module), which gave us the FSEvents /
  stale-transform reliability problems. Instatic updates one node without a module round-trip.

## What

Introduce an **in-memory node-tree projection** of the rendered page as the fast representation the
canvas manipulates, reconciled to real source in the background — keeping VortSpec's real-code
source of truth, but adopting Instatic's tree ergonomics:

1. **A projected node tree** built from the inspector bridge (stable node identities, parent/child,
   props, text, the `data-source` origin per node). Direct manipulations (style, text, variant,
   move, insert, delete, list reorder) mutate this tree instantly and render optimistically.
2. **Identity-first source reconciliation.** The background writer maps a tree node to source by
   **stable identity** (fingerprint / signature), using `data-source` only as a hint — line:col
   never drives a write. This subsumes RT-3 and DR-2 and removes the whole stale-anchor class.
3. **Per-node island updates** where the runtime allows, so a single-node change doesn't need a
   module reload — closing the HMR-granularity gap.
4. **The determinism boundary made explicit in the tree.** Data-driven subtrees (`.map` over
   external data) are marked in the projection so the UI can show *why* a node isn't directly
   editable, instead of dead-ending in an AI message.

## Impact

- Removes the mitigations layered around positional anchors (RT-3 ordering, DR-2 re-location,
  much of the flush/stamp fragility) in favor of one identity-based model.
- Shrinks the AI surface toward Instatic's "no AI for structure" — AI stays only for genuinely
  external-data edits and language prompts.
- Large, staged change to `run-canvas` / the inspector bridge / the codemod write path; must land
  behind the existing canvas flag and preserve today's behavior until each stage is proven.

## Out of scope

- Replacing real source as the source of truth (the tree is a projection/accelerator, not the
  system of record).
- A visual node-tree editor UI beyond what the canvas already exposes.
