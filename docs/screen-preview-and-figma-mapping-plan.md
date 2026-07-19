# Plan — Previewable Screens From the Start + Figma-Mapping Infrastructure

> Status: proposal (2026-07-19). Two linked threads:
> **A.** Make screens **preview-addressable at generation time** (SDD-DE methodology change) so VortSpec never has to retrofit a preview harness.
> **B.** Replace VortSpec's per-session *re-derivation* + fuzzy Figma matching with a **persistent, durable-key design-system index** — to cut token spend, speed up runs, and raise mapping accuracy.
>
> The design target for the product is "robust webpages with **a lot of screens**." Both threads are about making that scale cheap and reliable.

---

## 1. Why now — the reference architecture and its measured result

The reference (`agentic-design-system-visualization.vercel.app`) visualizes an agentic design system whose entire thesis is our exact question: token cost, speed, and accuracy of design-system agents. Its measured experiment ("ARC Benchmark", quoted from the app):

> With a pre-built index vs without — **accuracy 65% → 100%, 58% faster, run-to-run variance 26.5% → 0.04%, false negatives 60% → 0 — at essentially the same token cost (27.2K vs 28.2K). The infrastructure converts token spend from exploration into analysis.**

The techniques that produce that result:

| # | Technique | What it is |
|---|-----------|-----------|
| 1 | **Durable-key joins** | `maps/components.json` joins each component's `codePath` ↔ Figma `componentSetId` (fast in-file) + `componentKey` (publish-stable, survives rebuilds). `maps/tokens.json` joins 348 tokens ↔ Figma variables by `variableKey`, **with drift detection**. |
| 2 | **Design-identity manifest** | `.figma/manifest.json` — font, icon set (by key), token namespace roots, text-style naming, variant conventions — "generate once, consistent everywhere." Every skill reads identity from here. |
| 3 | **Deterministic scripts compute; LLM only decides *when*** | `index_codebase.py`, `scan-variables.mjs`, `sync-components.mjs` — "same input, same output, every run. The LLM decides WHEN to index, never WHAT the index contains." |
| 4 | **Precomputed, compact, cached index** | `.ai/index.toon`, `component-usage.toon`, `design-tokens.toon`, `dependencies.toon` in **TOON** (Token-Oriented Object Notation). CLAUDE.md cache rule: "Always cache index files, relationship graphs, dependency maps; load component metadata on demand." |
| 5 | **`dependsOn`** | components.json records nested DS instances → generation resolves **bottom-up**. |
| 6 | **Schema-validated maps** | JSON Schemas enforce the shape of both maps — contracts on both surfaces. |
| 7 | **figma-cli speed daemon** | persistent connection; scripts POST `{action:'eval',code}` to `/exec` — avoids per-call startup. |
| 8 | **AI-ready component metadata** | `Component.metadata.ts` (usage, patterns, anti-patterns) under a Metadata Schema contract. |

---

## 2. VortSpec today (audited) — where the tokens go

VortSpec is **file-derived and Figma-authoritative, with no persistent codebase index**. Findings:

- **Mapping is fuzzy, not keyed.** Figma↔code is recomputed **every session** by normalized *name* + normalized *value* matching (`inspector/figma-push.ts:computePushPlan`, `inspector/token-resolver.ts`). The only persisted link is `.vortspec/token-links.json`, keyed by the code token's normalized *name* — **not** a Figma `variableKey`. `.sdd-de/components.json` is a flat roster (`name`, `level`, `description`, occasionally a prompt-written `figmaNodeId`) — **no `codePath`, no `componentKey`, no `dependsOn`.**
- **Code-side derivation is not cached.** Tokens (`inspector/token-parser.ts:getInspectorTokens`), components (`inspector/component-reader.ts:getInspectorComponents`), and routes (`main/routes/route-discovery.ts`) are **re-scanned from disk on every Playground/Inspector open.** Only Figma reads are cached (`.vortspec/figma-variables.json`, `.vortspec/figma-components.json`).
- **Claude Code runs re-explore.** Apply/build prompts (`shared/sdd-prompts.ts`) hand Claude the task but not a precomputed map — so each run spends tokens rediscovering components, token names, and file paths. This is precisely the "exploration" spend the ARC benchmark converts to "analysis."
- **Accuracy risks in name/value matching.** Two tokens sharing a value (e.g. both `8px`), a renamed variable, or a mode variant all break name/value joins. Durable keys would not.
- **Screens have no preview path by default** — the harness must be retrofitted (the feature we just built). The methodology never made screens addressable at generation.

**Net:** VortSpec already has the *deterministic scanners* the reference relies on (route discovery, token parser, component reader). What it lacks is **(1) durable keys, (2) persistence + reuse of the scan, and (3) feeding that index into Claude Code runs.** Those three are the whole ARC delta.

---

## Part A — Methodology change: previewable screens from the start

**Goal:** every generated app is **preview-addressable** — VortSpec can render any screen standalone with zero retrofit and zero extra Claude run.

**Where it lives:** the SDD-DE methodology (`.sdd-de/docs/*` + the page-generation skill), propagated to new projects by the `/setup` skill. VortSpec is the cockpit and must not reimplement the methodology, so the change is *authored as methodology*, not as VortSpec TypeScript.

### A.1 The contract (add to `.sdd-de/docs/page-standards.md`)

Add a new section **"Preview-addressable screens"**:

> Every screen must be reachable by URL so it can be previewed in isolation.
>
> - **Router apps (Next.js, react-router, SvelteKit, Nuxt, Angular):** every screen already has a route — nothing to add. Screens are addressable by their path.
> - **State-navigated apps (no router — a screen shown by local state):** the app **must be deep-linkable**. On mount, the entry reads a `?screen=<Name>` query param (plus any selection id, e.g. `&item=<id>`) and initializes navigation state to that screen; when the user navigates in-app, reflect the current screen in the URL via `history.replaceState`. This reuses the app's **real** prop-building logic — no separate harness, and the deep link works in a normal browser too.
> - **Register every screen** in `.vortspec/screen-preview.json` so the cockpit's sitemap can list and open them:
>   ```json
>   { "param": "screen", "screens": [ { "name": "DestinationDetail", "file": "src/screens/DestinationDetail.tsx" } ] }
>   ```
> Prefer deep-linking the app over a dev-only harness. Only when deep-linking is impractical, add a dev-only, `import.meta.env.DEV`-guarded harness in the entry that renders the requested screen with representative sample props.

### A.2 The generation step (add to the page/screen-generation skill, e.g. `/generate-artifacts`)

Add a mandatory post-step whenever a screen is created:

> After generating a screen that is navigated by state (not a route):
> 1. Ensure the app entry reads `?screen=` (deep-link) or has the dev-only harness — create it once if absent.
> 2. Ensure the screen's navigation is URL-reflected (`history.replaceState` on state change).
> 3. Add/patch the screen's entry in `.vortspec/screen-preview.json`.
> Verify: `vite build` still passes and production rendering is unchanged (the deep-link/harness is dev-guarded).

### A.3 Per-framework deep-link snippet (add to `.sdd-de/docs/framework-config.md`)

Reference implementation for React/Vite (state-navigated):

```tsx
// src/App.tsx — deep-linkable screen state
const params = new URLSearchParams(location.search);
const [screen, setScreen] = React.useState(params.get('screen') ?? 'home');
// reflect navigation in the URL so every screen is a shareable deep link
React.useEffect(() => {
  const u = new URL(location.href);
  screen === 'home' ? u.searchParams.delete('screen') : u.searchParams.set('screen', screen);
  history.replaceState(null, '', u);
}, [screen]);
```

For `DestinationDetail`-style screens that need a selection, also read `&item=<index|id>` and hydrate from the app's own data (`LISTINGS[i]` → `toDestination(...)`) — reusing real prop logic, not synthesized sample data.

### A.4 VortSpec side (already shipped, keep)

`route-discovery.ts` reads `.vortspec/screen-preview.json` → screens become navigable via `?screen=`; auto-setup only fires for legacy apps that predate the convention. Once A.1–A.3 ship, **new apps arrive already previewable** and the auto-setup run never triggers.

**Payoff:** zero retrofit runs for all future apps; screens are shareable deep links; the cockpit's canvas/inspector work on any screen uniformly.

---

## Part B — Figma-mapping & index infrastructure (the ARC delta)

Ordered by leverage. B1–B3 are the token/speed/accuracy core; B4–B6 are follow-ons.

### B1 — Durable-key join table (accuracy)

Upgrade the component/token maps from name/value matching to **durable-key joins**, mirroring `maps/components.json` / `maps/tokens.json`.

- Extend `.sdd-de/components.json` entries (or add `.vortspec/maps/components.json`) with: `codePath`, `category`, `componentSetId`, `componentKey`, `dependsOn[]`.
- Add `.vortspec/maps/tokens.json`: each code token → `variableKey` + `figmaCollection/mode` + last-seen `value` (for drift).
- **Resolver precedence becomes:** `componentKey/variableKey` (durable) → `token-links.json` (name) → value → alias. Keys win; name/value become fallbacks only.
- Populate keys during the existing Figma sync (`figma-cli.ts:sync*`): the read scripts already return node ids; also capture `key` (publish-stable) alongside.
- **Impact:** eliminates the rename / duplicate-value / mode-variant failure modes; the join stops being recomputed by fuzzy logic each session.

### B2 — Persist the deterministic scan; stop re-deriving per open (speed + tokens)

VortSpec already scans deterministically — the fix is to **persist and reuse**.

- Add `.vortspec/index/` written by the existing scanners: `components.json` (roster + props + tokens used), `tokens.json` (definitions + usage counts), `screens.json` (route/screen tree), `deps.json` (component dependency graph from `dependsOn` + import scan).
- Invalidate by mtime/hash: on Playground open, re-scan only files changed since the index was written (a `mtime` map); otherwise load the cached index. Wire an optional watcher for live refresh.
- Canvas/inspector IPC (`inspectorTokens`, `inspectorComponents`, `discoverRoutes`) read the index first, scanning only on miss.
- **Impact:** near-instant Inspector/Playground open on warm cache; deterministic ("same input, same output"), which also kills run-to-run variance.

### B3 — Feed the index into Claude Code runs (the biggest token lever)

Today apply/build prompts make Claude re-read the codebase. Instead, **inject the precomputed index** into run prompts.

- Add an index digest to `sdd-prompts.ts` builders (`buildOnePrompt`, `BUILD_REMAINING_PROMPT`, apply/compose prompts): the relevant component's `codePath`, its `dependsOn`, the token map slice it uses, and the exact files to edit.
- Serialize the digest compactly. Evaluate **TOON** for the agent-facing digest (the reference's token-savings format); the canvas-facing IPC can stay JSON. Only adopt TOON where an *LLM* reads it.
- **Impact:** directly reproduces the ARC result — token spend shifts from exploration to the actual edit; fewer wrong-file edits; faster completion. This is where "same tokens, 58% faster, 100% accurate" comes from.

### B4 — Drift detection surfaced in the canvas (accuracy/trust)

- On each Figma sync, diff `.vortspec/maps/tokens.json` (last-seen value) vs the live Figma variable and vs the code token file; write a `drift` flag per token (VortSpec already has `figma-reconcile.ts:reconcile()`).
- Surface a drift badge/section in the token panel and an "audit report" (the reference's "for pennies" audit) listing violations by component.
- **Impact:** catches design/code divergence continuously instead of by manual verify.

### B5 — figma-cli speed daemon (perf, optional)

- VortSpec's `figma-cli.ts` reconnects/evals per operation. Add a persistent daemon mode (the reference's `/exec` + token) so batch syncs and pushes reuse one connection.
- **Impact:** lower per-op latency on multi-component syncs; no token change.

### B6 — AI-ready component metadata (optional, higher effort)

- Generate `Component.metadata.ts` (usage, patterns, anti-patterns) per component, under a schema, and index it. Load on demand (per the cache rule) when Claude works on that component.
- **Impact:** better composition accuracy for screen generation; meaningful for the "many screens" goal but heavier — defer until B1–B3 prove out.

---

## 3. Sequencing & tracking

Each item becomes an OpenSpec change under `openspec/changes/`.

1. **A (methodology)** — author the standards + skill step + framework snippets; validate by generating one new state-navigated app and confirming zero-retrofit preview. *Small, high value, unblocks the "many screens" goal.*
2. **B1 (durable keys)** — schema + sync capture + resolver precedence. *Accuracy foundation.*
3. **B2 (persist index)** — write/invalidate `.vortspec/index/`; readers prefer cache. *Speed.*
4. **B3 (index → prompts)** — inject digest; optional TOON for agent-facing text. *Token lever.*
5. **B4 (drift)**, then **B5/B6** as capacity allows.

## 4. Prove it — a mini ARC benchmark

Adopt the reference's discipline: measure **before/after** on a fixed task set (e.g. "apply N token edits across M components", "generate K screens"), recording **tokens, wall-clock, accuracy (correct edits / total), and run-to-run variance**. Ship each B-item only if it moves those numbers. Target: match the ARC shape — large accuracy/speed/variance gains at flat-or-lower token cost.

## 5. Risks & guardrails

- **Invariant:** VortSpec stays the cockpit — deterministic scanners and maps are cockpit infra; the *methodology* (Part A) is authored as SDD-DE, not reimplemented in VortSpec. Claude Code remains the engine for generation.
- **Cache staleness:** every persisted index must be invalidated by file hash/mtime and be fully derivable from disk (consistent with `flow.json`'s "always derivable" rule) — never a source of truth, only a cache.
- **Durable keys can still go missing** (unpublished Figma components): keep name/value matching as the documented fallback, never the primary.
- **TOON** only where an LLM reads the artifact; don't complicate canvas-facing IPC.
