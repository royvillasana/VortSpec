# Draw-to-component — the project graph + subgraph grounding

The Playground's **Draw** tool lets a user sketch on a persistent, project-scoped canvas
(Excalidraw, MIT) and turn a sketch into a design-system component — created or customized —
grounded in the project's **real** tokens and components, never generic Tailwind. This doc
describes the durable substrate that makes that work: a typed **project graph** and the
`selectSubgraph` grounding contract that feeds the compose pipeline.

Draw is not a new generation pipeline. It is a new *input* to the existing one
(`insert` placeholder → `useComposeRun` → result marked `data-component` → background framework
build). The graph is the persistence layer for drawings + their lineage, and the lens that
selects *just enough* design-system context for each generation.

## The problem

The feature's requirements are relationships, not records:

- **One drawing → several components.** A sketch can spawn more than one component, or feed
  different spots.
- **Component evolutions.** Regenerating on a sketch produces a new *version* that edits the
  prior one; a component's lineage back to its sketch must be queryable.
- **Grounded output.** The generator must reference only the project's tokens and reuse its
  existing components — enforced, not hoped-for via prompt discipline.
- **A canvas you return to.** Drawings persist; opening Draw shows the user's canvas, with each
  sketch showing what it became.

A flat `links.json` fights all four. A **graph** models them natively, and VortSpec already
grounds agents by index (`groundWithIndex` → `buildIndexDigest` prepends a components+tokens
digest). This graph upgrades that flat digest to a relational one; Draw is its first consumer.

## The graph

`.vortspec/canvas/graph.json` — a plain, JSON-serializable `{ schemaVersion, nodes, edges }`.
The Excalidraw scene lives beside it at `.vortspec/canvas/canvas.excalidraw`; exported sketch
PNGs at `.vortspec/canvas/exports/`; generated version outputs are referenced by path
(`outputRef`), never inlined into the graph.

`Component`, `Token`, and `Page` are **reference nodes** (keyed by name/path) to the
authoritative sources (`.sdd-de/components.json`, the token index, `.vortspec/light-pages/`).
The graph records *relationships*; it never duplicates a component's spec or a token's value
(beyond a mirrored convenience `value` on `Token`).

### Node types

| Type | id | Key fields |
|---|---|---|
| `sketch` | `sketch:<frameId>` | `label`, `note?`, `frameId` (Excalidraw frame), `pngRef?`, `bbox?` |
| `component` | `component:<Name>` | `name`, `tier?`, `origin: "design-system" \| "drawn"` |
| `version` | `version:<Name>@<n>` | `component`, `n`, `sketchId`, `promptHash?`, `resultHash?`, `outputRef?`, `status` |
| `token` | `token:<--name>` | `name`, `value?` (mirrored from the resolver) |
| `page` | `page:<name>` | `name`, `path?` — placement, post-MVP |
| `spot` | `spot:<page>#<slot>` | `page`, `slotPath?` — placement, post-MVP |

`version.status` is `generated | accepted | discarded`, mirroring the compose accept/discard flow.

### Edge types

`{ type, from, to, meta?, createdAt }`.

| Edge | from → to | Meaning |
|---|---|---|
| `GENERATED` | Sketch → Version | this sketch-run produced this version (provenance) |
| `OF` | Version → Component | which component this version is |
| `EVOLVED_TO` | Version → Version | v_n → v_{n+1} lineage (same component) |
| `REFERENCES` | Sketch → Component | user-picked grounding; `meta.role: "trace" \| "reuse" \| "customize-target"` |
| `USES_TOKEN` | Version → Token | tokens the output references |
| `COMPOSES` | Component → Component | molecule → atoms (imported from DS metadata) — post-MVP |
| `PLACED_AT` | Version → Spot | where a version landed on a page — post-MVP |

**Derived, not stored — REUSED_FOR.** "One drawing → several components" falls out of the model:
a `Sketch` with `GENERATED` edges to versions whose `OF`-components differ. No dedicated edge.

## Builders and queries

Pure, framework-free code in `packages/core/src/shared/draw-graph.ts` (mirrors the token
resolver). Builders are **deterministic** — the caller supplies `id` and `now`, so the pure
layer never calls `Date.now()`/uuid. Every builder returns a new graph (`g → g'`).

```
addSketch(g, {frameId, label, note?, bbox?}, now)
linkReference(g, sketchId, component, role, now)
recordGeneration(g, {sketchId, component, promptHash?, resultHash?, outputRef?, status?, now})
  → { graph, versionId }   // Version + GENERATED + OF; EVOLVED_TO(prevLatest → new) if a prior
                           //   version of this component exists (the per-component lineage)
setVersionStatus(g, versionId, status)
recordTokens(g, versionId, tokens[], now)   // {name, value?}[] → Token nodes + USES_TOKEN
linkComposes(g, parent, child, now)         // import DS structure
reconcile(g, {components, tokens})          // prune REFERENCES/COMPOSES/USES_TOKEN to missing names
```

Queries run over a `GraphIndex` built once at load (`buildIndex(g)` → nodes-by-id + out/in edge
maps):

```
componentsFromSketch(ix, sketchId): string[]
versionsOf(ix, component): Version[]      // ordered by n
lineage(ix, component): Version[]         // the EVOLVED_TO chain — the "evolutions" view
latestVersion / latestAccepted(ix, component): Version | null
sketchOf(ix, component): Sketch | null    // provenance back to the drawing
selectSubgraph(ix, sketchId, opts?): SubgraphSlice
```

## `selectSubgraph` — the grounding contract

The heart of the DS-grounding differentiator. Given a sketch, return a **bounded, relevant
slice** of the graph to serialize into the compose prompt — enough to reuse the right components
and tokens and to edit prior output, without dumping the whole design system at the model.

```
selectSubgraph(ix, sketchId, opts?: {
  maxComponents?: number;     // breadth cap (default 8)
  maxTokens?: number;         // token cap (default 40)
  includePriorOutput?: boolean; // pass prior version refs back for iterate (default true)
  hops?: number;              // COMPOSES expansion depth (default 1)
}): SubgraphSlice
```

Traversal, in priority order, spending the component budget top-down:

1. **The sketch** — `label`, `note`, `pngRef` (the image is attached to the run separately; the
   ref is included for the record).
2. **Reference components** — `REFERENCES` targets (the user's explicit "reuse/trace these"). A
   `customize-target` role flips `intent` to `customize-existing` and marks that component as the
   base to edit (its latest version's `outputRef` is surfaced as `customizeTarget`).
3. **Composed children** — expand each reference via `COMPOSES` to `hops` depth (a referenced
   `Card` → `Button` + `Badge`), so the model knows the sub-parts.
4. **Prior evolutions of THIS sketch** — via `GENERATED → Version → EVOLVED_TO`: the latest
   accepted output ref for components this sketch already produced, so a regenerate **edits**
   rather than restarts (Make Real's lesson, persisted).
5. **Tokens** — union of `USES_TOKEN` across the included components' latest versions (name +
   mirrored value), capped at `maxTokens`. A brand-new sketch with no token edges returns an
   empty set; the prompt layer supplies the DS core token set as fallback.
6. **Siblings (spare budget only)** — same-tier component nodes not already included, name-only,
   nudging the model toward existing atoms over invention.

Output (JSON-serializable → prompt):

```ts
interface SubgraphSlice {
  sketch: { id; label; note?; pngRef? };
  intent: "create-new" | "customize-existing";
  customizeTarget?: { component: string; latestVersion?: number; outputRef?: string };
  referenceComponents: Array<{ name; tier?; role: "trace" | "reuse" }>;
  composedFrom: Array<{ parent: string; children: string[] }>;
  priorVersions: Array<{ component: string; version: number; outputRef?: string }>;
  siblings: string[];
  tokens: Array<{ name; value?: string }>;
  budgets: { components: number; tokens: number; truncated: boolean };
}
```

The slice carries **refs, not blobs** — it stays pure (no file reads). A thin main-process step
hydrates `outputRef`/`pngRef`/stand-in HTML from disk and calls `renderSubgraphForPrompt(slice)`
to produce the text appended to `buildComposePrompt` (compose-run.ts) **alongside** the PNG
attachment — augmenting the existing roster/tokens/`designMd` inputs, not replacing them.
Enforcement, baked into that block: *reference ONLY the listed tokens; reuse the listed
components; when `customizeTarget` is present, EDIT its output rather than regenerate.*

## Worked example

Sketch `"product card"` `REFERENCES` `Card` (reuse) + `Badge` (trace); `Card COMPOSES Button`.
First generate → `recordGeneration` makes `ProductCard@1` with `GENERATED` + `OF`. User redraws →
`ProductCard@2` with `EVOLVED_TO(@1 → @2)`. Now:

- `selectSubgraph("sketch:product-card")` → intent `create-new`; references `[Card(reuse),
  Badge(trace)]`; `composedFrom [{Card → [Button]}]`; `priorVersions [{ProductCard, 2, <ref>}]`
  (so `@3` edits `@2`); tokens = union of Card/Badge/Button usage, capped.
- `componentsFromSketch` → `["ProductCard"]`. A second generate targeting a `MiniCard` adds a
  second `OF`-component → the drawing is now **reused for two components**, purely from the edges.

## Sync

The graph references components/tokens by name; it never owns their definitions. On canvas open
(and after a background component build completes) `reconcile(g, {roster, tokens})` prunes
`REFERENCES`/`COMPOSES`/`USES_TOKEN` edges to components/tokens that no longer exist, keeping the
graph consistent with the authoritative index. Sketches and versions are retained as history even
if their component is deleted (provenance is not lost).

## App integration — a separate window

The drawing surface opens as its **own window**, never as an overlay on the Playground. The
Playground screen, its `<webview>`, and its canvas are left completely untouched — no overlay, no
coordinate mapping, no z-index or reload fights with the stable-key preview webview.

- The Playground bottom-toolbar **Draw button is a launcher**, not a canvas mode — clicking it
  opens (or focuses) the dedicated Draw window. It does **not** change the current Playground
  view or selection.
- The Draw window is its own Electron `BrowserWindow` hosting the Excalidraw editor. On open it
  loads the project's persisted scene via the `canvas-store` (`loadScene`) so the user always
  returns to **their** canvas; edits autosave back (`saveScene`) and the graph updates via
  `saveGraph`. It is project-scoped and persistent, not a throwaway.
- **Generation is coordinated through the main process**, not within either window. From the Draw
  window, "Generate" exports the sketch PNG (`writeSketchPng`) and builds the grounded prompt
  (`selectSubgraph` + `renderSubgraphForPrompt`); main runs the compose agent; the produced
  component lands in the **Playground** (main window) through the existing compose/light-page flow.
  So the two windows stay decoupled — the Draw window owns sketches, the Playground owns the live
  page — and they communicate only via the main process (IPC + the `.vortspec/canvas` store).
- Closing the Draw window never disturbs the Playground; reopening restores the canvas from disk.

None of the code layer (`draw-graph`, `subgraph-prompt`, `canvas-store`) is window-specific — it is
the shared substrate both the Draw window and the main process build on.

## Scope

- **MVP:** `sketch`/`component`/`version`/`token` nodes; `GENERATED`/`OF`/`EVOLVED_TO`/
  `REFERENCES`/`USES_TOKEN` edges; `selectSubgraph` (references + composed + prior + tokens +
  budgets). Draw button opens the **separate Draw window** (persistent canvas) → generate through
  the existing compose pipeline, landing the component back in the Playground.
- **Later:** `COMPOSES` import from DS metadata, `PLACED_AT`/`page`/`spot` placement tracking,
  a canvas index UI (per-frame "→ ProductCard v3" chips) and evolution history views.
