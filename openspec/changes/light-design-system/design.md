## Context

The Playground renders the user's real framework app in a webview and reads the **live rendered DOM** (the inspector-bridge structure snapshot), so its visual surface is already framework-agnostic. Page creation, however, hands the request to the user's own headless `claude` CLI, which writes **real framework source** (JSX/CVA referencing tokens) into the repo, and Screen Creation is hard-gated on the whole framework library existing (`/storybook` + `/design-doc` + every component). The generated `DESIGN.md` is intentionally a *living index into real code* (JSX imports, `.variants.ts`, Storybook URLs), which is exactly wrong as context for an LLM asked to author framework-free HTML.

Two prior research passes established: (a) the node-tree projection (`packages/ui/src/components/run-canvas/node-tree.ts`) and reconciler (`reconcile.ts`) are framework-free — only the `data-source` dev-stamp and the ts-morph JSX write layer are framework-coupled; (b) the toolkit already captures resolved token values, a token→css-property map (Component Spec "Design Tokens Used"), variants/sizes/states, and a `components.json` inventory — everything needed to derive a lite manifest **except** a framework-free HTML structure per component.

## Goals / Non-Goals

**Goals:**
- Cut time-to-first-page from "whole framework library" to "the light shelf" by letting composition start against a fast, browsable lightweight design system.
- Keep the light surface a **derived projection** of a single source of truth (the contract / `DESIGN.md`), so it can never diverge into a competing implementation.
- Preserve every invariant: no direct Figma access, real Storybook is never replaced, every value references a token, one source of truth per lifecycle phase.
- Make light→framework compile **deterministic** by carrying identity (token name + component name/`data-component`) through the light artifacts.

**Non-Goals:**
- Multi-framework compile. Target React-CVA first and measure the deterministic-vs-AI split before generalizing.
- Continuous bidirectional sync of two live representations (explicitly rejected — see Decisions).
- The container-aware-move wiring (separate in-flight work).
- Replacing `DESIGN.md`, real Storybook, or the existing 7-step framework build.

## Decisions

**D1. Light-first creation with a compile checkpoint — not continuous dual-sync.** The light surface is the authoring/creation format; editing continues on the real rendered surface via the existing deterministic instant-edit path. *Alternatives:* a permanently-synced dual replica (rejected — re-creates the hardest cross-representation identity problem, strictly worse than today's DOM↔source mapping), or "light is the only source, framework is pure export" (rejected — drops the edit-real-components model already built). Every visual builder (Webstudio/Builder/Plasmic) confirms: one source of truth per phase, one-directional export.

**D2. A separate derived `designer.md`, not raw `DESIGN.md`, for the light LLM.** The decision is about *context hygiene*, not storage: the light agent must see a coherent light-only world with no framework pointers. `designer.md` is a regenerated projection (never hand-forked), so the two-files-drift risk is nullified. *Alternative:* one layered `DESIGN.md` with a light section (rejected — labeling is fragile; a single stray JSX import in context re-introduces the confusion).

**D3. Dual-key tokens (name + resolved value).** Value makes the light HTML render standalone and pixel-exact; name keeps discipline correct-by-construction and lets compile restore the token reference with nothing to invent. This is the keystone that makes compile deterministic.

**D4. Harvest component stand-ins from the real rendered DOM.** The one missing field (framework-free component structure) is filled by snapshotting each framework component's Storybook stories (every variant/state) through the existing structure-snapshot machinery and freezing the result. The stand-in is thus the component's *actual* render, not an approximation — dissolving the component-fidelity worry. Before a framework version exists, a fast Figma-derived placeholder stands in and is later replaced. *Alternatives:* author stand-ins by hand (rejected — net-new manual work), or derive from the Figma node (rejected — would require direct Figma access, which VortSpec forbids; only the user's read-only MCP may read Figma).

**D5. Contract-first two-track parallel build for convergence.** Both tracks build to the same `extract-design-system` contract, so identity converges by construction and only visuals are eventually-consistent (closed by D4). *Alternative:* two agents deriving from Figma independently (rejected — guaranteed drift; the compile mapping breaks the moment the light `Button` ≠ the framework `Button`).

**D6. Soft, per-component readiness gate.** `light-only`/`framework-ready` replaces the hard prerequisite; compose freely, compile gated per component. Turns an all-or-nothing block into a visible, incremental one.

**D7. Reuse the framework-free reconciler + compose-run for compile.** The abstract node-tree already diffs to deterministic edits; compose-run already composes from roster components grounded in tokens and stamps `data-component`. Compile maps light identity → those existing mechanisms rather than inventing a new codegen path.

## Risks / Trade-offs

- **Two representations drift** → Mitigated by D2/D5: `designer.md` and the palette are regenerated projections of one contract; both build tracks share contract identity; harvest reconciles visuals. Nothing is hand-forked.
- **Placeholder stand-ins mislead before harvest** → Mitigated by D4/D6: placeholders are visibly marked `light-only`; the harvested real render replaces them on `framework-ready`.
- **Token invention during compile** → Mitigated by D3: every value carries its token name; compile maps by name and never defines a token; a lint step asserts no known-token literal leaks into output.
- **Accidental Figma coupling in the fast agent** → Mitigated by D5: the light track consumes only the already-extracted contract; extraction is the sole Figma reader, via the user's read-only MCP.
- **Palette mistaken for a Storybook substitute** → Mitigated by naming/placement: real Storybook is still built and is the harvest source; the palette is presented as a Playground authoring surface.
- **Cost of two agents** → Mitigated by tiering: the light track is Haiku-tier and mechanical; the careful framework track is unchanged. Net time-to-first-page drops sharply.

## Migration Plan

1. Ship the `designer.md` derivation + the fast light-shelf generator behind the existing extraction flow (additive; nothing changes for projects that don't use it).
2. Add per-component readiness state + the soft gate in the Playground, keeping the old hard gate as fallback until validated.
3. Add the harvest step wired to the existing Storybook + structure-snapshot machinery.
4. Add the deterministic React-CVA compile-back reusing compose-run/reconciler; measure the deterministic-vs-AI split before generalizing to other frameworks.
5. Update CLAUDE.md's Screen Creation prerequisite to the soft gate once the flow is proven.

**Rollback:** each stage is additive; disabling the light track reverts to today's hard-gated framework-first flow with no data migration.

## Open Questions

- Where does `designer.md` live per project, and how is regeneration triggered (on extraction, on `DESIGN.md` change, on demand)?
- Exact serialization of a component stand-in (inline-styled HTML vs. HTML + a scoped CSS block keyed by name/variant).
- How the Playground presents readiness (badge, filter, ghosted component) and how compile surfaces the list of blocking `light-only` components.
- Measured deterministic-vs-AI ratio of the React-CVA compile — informs whether other frameworks are viable in a later pass.
