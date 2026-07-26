# Design — Node-tree projection

## The two representations

```
   USER MANIPULATION                 FAST REP (in-memory)              SOURCE OF TRUTH (disk)
   drag / type / pick   ───▶   Projected Node Tree (instant)   ──debounced──▶   real .tsx via codemods
                               • stable node id (fingerprint)     reconcile      • identity-located
                               • parent/children, props, text     (background)   • line:col = hint only
                               • data-source origin (a HINT)
                               • dataDriven? (map/external)
```

Instatic's tree is the source of truth; VortSpec's tree is a **projection** — the real files stay
authoritative. The tree exists to (a) make manipulation instant and always-materialized, and (b)
give the reconciler stable identities so writes don't depend on positional anchors.

## Node identity (the key to killing stale anchors)

Each projected node carries a **stable identity** = the existing `fingerprint` / `classSignature`
(tag + class signature + structural path), NOT line:col. The reconciler locates the target JSX by
that identity (`matchBySignature`, already built), and only consults `data-source` to disambiguate
when the signature matches more than one element. Line:col never drives a write — it removes RT-3
(burst ordering) and DR-2 (re-location) as special cases, because there is no positional write.

## Reconciliation

- Manipulations enqueue **tree mutations** (set-prop, set-text, move-node, insert-node,
  remove-node, reorder-list). A debounced reconciler diffs the tree against the last-persisted tree
  and emits the minimal codemod set, each located by identity.
- Structural mutations on a **data-driven** subtree are the only ones that hand off (to array-data
  edits when local, or the assistant when external) — surfaced from the `dataDriven` flag on the
  node, so the UI explains it up front instead of failing after an AI run.
- The existing deterministic codemods (`setJsxAttr`, `setInlineStyle`, `setTextNode`,
  `moveNodeRelative`, `insertComponent`, `deleteNode`, `removeArrayItem`, `reorderArrayItem`) are
  reused as the emit targets — this is a re-plumb of *how the target is located*, not new codemods.

## Per-node islands

Where the project's dev runtime supports it, apply a single-node update in place (the inspector
bridge already overlays live style/text/class) and skip the module reload; fall back to HMR only
for changes the overlay can't express. This is an optimization layered on top, not a prerequisite.

## Staging (must not regress today's behavior)

1. **Build the projection** from the bridge readouts; render it read-only alongside the current
   flow (no behavior change). Prove the tree matches the DOM.
2. **Route reads** (selection, layers, dirty set) through the tree.
3. **Route writes** through identity-located reconciliation; retire the positional write path and
   its RT-3/DR-2 mitigations once parity is proven by the existing CTs + new tree CTs.
4. **Islands + data-driven surfacing** last.

Each stage lands behind the existing canvas flag; the instant-canvas-edits CTs are the regression
gate at every step.

## Alternatives considered

- **Keep positional anchors, add more guards.** That is the current path; the review shows it
  trends toward an ever-growing pile of mitigations. Rejected as the long-term model.
- **Adopt an owned tree as the source of truth (full Instatic).** Rejected — it discards VortSpec's
  real-code fidelity, the core product differentiator.

## Risks

- Building a faithful projection from the DOM/bridge is non-trivial (fragments, portals, conditional
  renders). Mitigated by staging read-only first and gating on the CTs.
- Identity collisions (two identical elements) still need `data-source` as a tiebreaker — the tree
  keeps it as a hint, so this degrades to today's behavior, never worse.
