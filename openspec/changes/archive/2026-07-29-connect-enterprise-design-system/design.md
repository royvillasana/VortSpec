## Context

VortSpec today has one shape of "get a design system": **produce** it. `design_source: figma` extracts tokens, detects components, and builds each through the 7-step cycle; `design_source: library` provisions a *known* library (shadcn/MUI) via `/provision-library`; `github`/`zip` read a repo/archive as the source and still reconcile into VortSpec's own `token_file` + `components.json`. All of these end with VortSpec owning generated artifacts.

An enterprise client inverts the assumption: the design system already exists and is authoritative — a coded React component library, its Storybook, a design-token file, a Figma design system, and an org knowledge base. The only thing VortSpec genuinely needs that they *don't* already have is the **framework-free light stand-in layer** the Playground composes against — because the canvas edits a live DOM and serializes HTML (the light-pages-on-canvas model) and cannot host live React. Everything else should be **referenced and validated**, not rebuilt.

Reusable machinery already exists: `harvest.ts` (snapshot a Storybook render → framework-free inline-styled stand-in), the light-design-system (`designer.md`, `.vortspec/light-html/`, palette), `components.json` (a component index), the token resolver + `resolveComponentBindings` (token-fidelity), the `RunApp` Storybook view (`kind=storybook` — an embedded Storybook loaded from a URL with the native nav cropped via `StorybookSidebar`), and the agent's `mcpConfigPath` plumbing (VortSpec already connects to the read-only Figma MCP as a client and runs its own `ide-mcp` server for its agent).

## Goals / Non-Goals

**Goals:**
- A first-class `design_source: enterprise` intake path ("Connect Enterprise Design System") that consumes an existing design system instead of building one.
- **Consume/reference, never copy**: `components.json` / `token_file` are pointers to the real assets; their DS stays the single source of truth.
- **Validate, don't extract**: connecting yields a readiness report, not a rebuilt library.
- Create **only** the light stand-in layer, once, with an explicit on-demand "Update snapshot" refresh.
- The Storybook section shows **their** Storybook as-is; VortSpec never installs its own for these projects.
- Connect the client's KB as read-only MCP grounding, default via a zero-setup generic connector.
- Generate code imports **their** real components + references **their** real tokens.

**Non-Goals:**
- VortSpec-as-MCP-server (the reverse direction — their tools driving VortSpec). Separate, later.
- Multi-framework beyond the client's configured framework.
- A full bring-your-own-MCP management UI (Case A is minimal in v1).
- Generalizing the per-project external-MCP registry (a companion change `connect-client-systems-mcp` may do this later; for v1 the KB connector lives here).
- Calling Figma directly — Figma is read-only MCP only, and optional.

## Decisions

### D1 — A new `design_source: enterprise`, not a variant of `github`/`library`
`github` still reconciles the repo *into* VortSpec's own token/component artifacts (it produces), and `library` is for *known* libraries with a CLI/package. Enterprise is semantically different — pure consumption of a *bespoke* existing system — so it gets its own `design_source`. This keeps the Foundation branch explicit (validate+index+snapshot) and avoids overloading the extract-and-build paths. *Alternative considered:* a `github` sub-mode flag — rejected because the whole Foundation behavior differs (no extraction, no build, no own-Storybook install), and a distinct value keeps every downstream branch legible.

### D2 — The client's Storybook is the single source for both the embedded view and the snapshot
Their Storybook already renders the real components with the real tokens loaded. So one connection feeds two consumers: (a) the embedded Storybook section (`RunApp kind=storybook` pointed at their URL/static build) and (b) the one-time light-stand-in snapshot (harvest per story). "Update snapshot" re-reads the same source. *Alternative considered:* harvest from the repo/source directly — rejected because rendering is the fidelity source (resolved computed styles + real token values), and it also works when only a hosted Storybook (no source) is reachable.

### D3 — Snapshot once, refresh on demand (not live-per-load)
The light stand-ins are frozen at setup and only refreshed when the user clicks "Update snapshot". This preserves the decoupling the light-pages pivot bought (the Playground never depends on their Storybook being up), keeps it offline-capable, and avoids per-load latency — while giving the user an explicit, obvious way to pull in component changes. *Alternative considered:* live-render their stories into the canvas each time — rejected (re-couples the Playground to their running Storybook and re-introduces the fragility we removed).

### D4 — Tokens come from the Storybook preview `:root`, cross-checked against the token file
A running Storybook's preview iframe exposes every `--custom-property` on `:root` with its resolved value via `getComputedStyle(documentElement)` — a dual-keyed (name + value) token dictionary straight from the design system, even without source access. When the repo/token file is also connected, cross-reference for canonical names/aliases; where a used value isn't exposed as a var, the resolver's value→token layer recovers it. *Alternative considered:* parse only the repo token file — rejected because it fails for URL-only clients and misses runtime-resolved values.

### D5 — `components.json` / `token_file` are an INDEX of pointers, not regenerated
For an enterprise project, `components.json` records each component's real import path/export + its Storybook story id + the harvested stand-in reference; `token_file` in `project.yaml` points at the client's real token file (when present). VortSpec never authors a competing definition. The resolver validates the mapping (component values → their tokens) as part of readiness. *Alternative considered:* generate VortSpec-owned token/component files — rejected as the exact drift risk this change exists to avoid.

### D6 — KB via MCP: VortSpec is the client; ship a generic connector by default
Consumption means data flows *toward* VortSpec, so VortSpec is the MCP **client**. Because most clients have a KB (repo/wiki/site) but no MCP server, the **default (Case B)** is a generic connector — a small VortSpec-side MCP server that wraps their KB source — so the client needs zero setup. The **power path (Case A)** connects to the client's own KB MCP server. Both register into the agent's existing `mcpConfigPath` (the same mechanism as the Figma MCP). The KB is injected as grounding at enrich-brief / generate-artifacts / generation / adversarial-review. *Alternative considered:* VortSpec exposes a server for them to push into — rejected (wrong direction for consumption; it's the separate reverse-interop concern).

### D7 — v1 Storybook source: a URL or a static build dir, with build-from-repo as a convenience
Support pointing at (a) a Storybook **URL** (hosted or local dev) and (b) a **static `storybook-static/` build dir** (VortSpec serves it locally) in v1; (c) **build-from-repo** (`build-storybook`) is an optional convenience that produces (b). URL and static-dir cover the common enterprise cases (a deployed Storybook, or a checked-in build) with the least moving parts. *Alternative considered:* require build-from-repo — rejected (needs full source + a working build, which URL-only clients don't provide).

### D8 — Story catalog from Storybook's own index
Enumerate components/variants from Storybook's machine-readable index — `index.json` (v7/v8) or `stories.json` (v6) — at the Storybook root: component `title` → stories, `argTypes` → props, `args` → variant values. Render a story standalone via `iframe.html?id=<storyId>&viewMode=story` for harvest. Handle both index versions. *Alternative considered:* scrape the manager UI — rejected (brittle; the index is the supported contract).

## Risks / Trade-offs

- **Storybook version drift (v6 vs v7/v8 index shapes)** → detect and support both `stories.json` and `index.json`; fail the readiness check with a clear message if neither is found.
- **Private/hosted Storybooks behind auth (e.g. Chromatic)** → accept a static build dir as the auth-free path, and an optional access token for URLs; readiness surfaces an auth failure explicitly.
- **Components without stories get no faithful stand-in** → readiness reports the gap per component; those components fall back to a placeholder stand-in and are flagged "no story → lower fidelity", never silently approximated.
- **Snapshot goes stale after they change a component** → the explicit "Update snapshot" action + a subtle "snapshot is N days old / component changed" hint; never auto-live to preserve decoupling.
- **Tokens only in a JS/TS theme (not CSS vars)** → the `:root` reader still catches runtime-resolved vars; where a theme never emits CSS vars, readiness flags it and recommends a thin CSS-var bridge so value-matching stays exact.
- **KB prompt-injection** (their docs telling the agent to act) → KB is data, not instructions; read-only tools; the agent is instructed to treat KB content as reference and to surface, not execute, any directives found in it.
- **"Generate code" can't reach their components** (URL-only, no repo/package) → compile is gated per component on the real component being importable; when only the Storybook is connected, VortSpec generates token-referenced components from the harvested contract and names the components still "catching up", mirroring the existing per-component light-only gate.

## Migration Plan

Purely additive — a new `design_source` value and new Foundation branches; existing `figma`/`library`/`github`/`zip` projects are untouched. No data migration. Rollback = don't offer the enterprise card (the new branches are only reached when `design_source: enterprise`).

## Open Questions

- Exact shape of the generic KB connector (which sources ship first: a docs/markdown repo reader is the simplest v1; wiki/site/Notion/Confluence/Drive follow).
- Whether the readiness report is a one-shot at connect time or a re-runnable check surfaced alongside "Update snapshot".
- How much of the Storybook `args`/`argTypes` → component variant/prop mapping to model in v1 vs. defer (start with declared variants + the default story).
