## Why

Screen Creation is hard-gated: today a user cannot compose a single page in the Playground until **every** framework component is built and `/storybook` + `/design-doc` have run (the CLAUDE.md prerequisites). Building framework components is the slow part — a full 7-step cycle (CVA + tokens + tests + stories) per component — so time-to-first-page is measured in the whole library, not the first screen. Worse, the generated `DESIGN.md` is deliberately *"a living index that points to real, implemented code"* (JSX imports, `.variants.ts` CVA files, `localhost:6006` Storybook URLs); handed to an LLM asked to author lightweight HTML it misleads the model into importing React and referencing Storybook.

This change lets page composition start in **minutes** — against a fast, browsable **lightweight design system** generated from the Figma-sourced contract — while the real framework components are built **in the background**. The two tracks share one contract, so they converge by construction; the light surface is a derived projection, never a competing source of truth.

## What Changes

- **New: "the design system" — a lightweight, browsable component palette.** A fast/cheap (Haiku-tier) agent turns the extracted contract into a light HTML/CSS/JS component shelf **plus a visual-reference section** showing components, spacing, margins, padding, and the tokens in use — everything captured from the Figma file. It becomes the Playground's authoring surface and is usable before any framework component exists.
- **New: `designer.md` — a derived, dual-keyed lite design manifest.** A projection of `DESIGN.md` (never hand-forked) that is the **only** design context the light-authoring LLM sees. Every token appears as **name + embedded resolved value**, so light HTML renders standalone with no framework, token discipline is correct-by-construction, and compile-back has no tokens to re-create.
- **New: component stand-in harvest.** The one thing the toolkit doesn't capture today — a framework-free HTML structure per component — is filled by snapshotting each framework component's **real rendered DOM + computed styles** from its Storybook stories (via the existing inspector-bridge structure-snapshot machinery) and freezing it as the component's stand-in. Before a framework component exists, the fast agent's Figma-derived stand-in is a placeholder that harvest later replaces with the real render.
- **New: contract-first two-track build with per-component readiness.** `extract-design-system` reads Figma **once** and produces the shared contract (`components.json` + specs: name, tier, variants, props, token bindings). A fast track builds the light shelf; a background track builds the real framework components from the **same** contract via the existing 7-step cycle. Each component carries a `light-only` → `framework-ready` flag.
- **Changed (soft gate):** the "all components before any screen" hard gate becomes a **soft, visible** one — users compose freely against `light-only` components; compiling a page to shippable framework code is gated **per component** on its framework version existing. The Playground surfaces which components are still catching up.
- **New: deterministic light-page compile-back.** A page authored on the light surface compiles to real framework code by mapping token names → the framework's token references and component names / `data-component` markers → the real CVA components — reusing the framework-free node-tree projection + reconciler and the existing compose-run flow.

## Capabilities

### New Capabilities
- `light-design-system`: the lightweight, browsable component palette ("the design system") — a fast HTML/CSS/JS component shelf plus a visual-reference section (components, spacing, margins, padding, tokens) generated from the Figma-sourced contract; serves as the Playground authoring surface and is usable before any framework component exists.
- `lite-design-manifest`: the derived `designer.md` — a dual-keyed (token name + embedded resolved value) projection of `DESIGN.md`, carrying component stand-ins, that is the sole design context exposed to the light-authoring LLM. Includes the harvest of stand-ins from framework components' real rendered DOM.
- `parallel-component-build`: the contract-first two-track build — one fast light track and one background framework track over a single shared contract — with per-component `light-only`/`framework-ready` readiness state and the convergence guarantee (shared identity; visuals reconciled by harvest). Supersedes the Screen Creation hard gate with a soft, per-component one.
- `light-page-compile`: deterministic compilation of a light-authored page into real framework code — mapping token names → framework token references and component names / `data-component` markers → real CVA components, reusing the framework-free reconciler and compose-run.

### Modified Capabilities
<!-- No existing spec's REQUIREMENTS change at the spec level; the Screen Creation gate change is embodied by the new `parallel-component-build` readiness model and noted under Impact. -->

## Impact

- **New shipped assets/skills** under `.sdd-de/` — the light-shelf generator agent, the `designer.md` derivation, the harvest step, and the light→framework compile step. Consumes the existing `extract-design-system` contract (`components.json` + specs) and `DESIGN.md`; does not add any direct Figma access (VortSpec still reaches Figma only via the user's read-only Figma MCP / Desktop Bridge).
- **Playground / IDE (packages/ui, packages/core, apps/ide)** — a new browsable "design system" surface and per-component readiness UI; compose against light components; compile gating. Reuses the framework-free `node-tree`/`reconcile` projection and the `compose-run` flow.
- **Supersedes the CLAUDE.md Screen Creation prerequisite** ("all components + /storybook + /design-doc before any screen") with the soft, per-component readiness gate — a workflow/docs update.
- **Non-goals (first pass):** multi-framework compile (target React-CVA first and measure the deterministic-vs-AI split before generalizing to Vue/Svelte/etc.); the in-flight container-aware-move wiring is tracked separately.
- **Invariants preserved:** real Storybook is never replaced by a lightweight substitute (the palette is a Playground surface, and harvest reads *from* real Storybook); every value references a design token; one source of truth per lifecycle phase (`DESIGN.md`/contract authoritative, `designer.md` + palette derived).
