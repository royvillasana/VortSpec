## Context

The `docs/design/` Claude Design bundle specifies a Figma-grade Inspector (Tokens, Component Detail, Graph, Issues, History, Assistant). It was authored for **v1**, whose architecture — an IR normalization pipeline that "infers" tokens and assigns provenance/completeness from a canonical store — was **deleted in the pivot** (`archive/web-app-v1`). In v2, Claude Code is the engine and the design system is just **files in the user's project**: a token file (`tokens.css` / Figma variables), `.sdd-de/components.json`, generated component source under `component_dir`, and `specs/*/…` reports. The existing `openspec/specs/inspector-tokens` and `inspector-components` still encode the IR model and must be re-based.

Two facts drive the design: (1) there is **no render harness** in generated projects today — `visual-verify` cannot render because there's no `src/main.tsx`, no stories, no browser driver; (2) VortSpec must not re-implement agent logic or a normalization pipeline (invariant #1). The deferred `PTY service` (PRD §7) and Dev preview (US-10, embedded webview of the local dev server) are the substrate the Playground builds on.

## Goals / Non-Goals

**Goals:**
- Browse **all** tokens and **all** components produced by the flow, inside the app, derived entirely from project files.
- Render real components live across variants/states (a Playground) that also serves as the render harness `visual-verify` needs.
- Let the user validate and request modifications, always gated, always written back to files.
- Preserve the bundle's visual language (density, mono values, provenance/source badges, swatches).

**Non-Goals:**
- No IR store, no token "inference", no normalization pipeline — provenance is file-derived, not computed.
- No in-app framework bundler/renderer of our own (we do not reimplement Storybook/Vite per framework).
- No new methodology steps in the SDD-DE cycle (the Inspector is a viewer/validator over artifacts, per guided-sdd-flow invariant).
- Not building Graph/History/Assistant/Issues screens in this change beyond what Tokens/Components/Playground and existing run outputs already provide (they remain future scope).

## Decisions

### D1 — Source everything from project files, not an IR store
Parse the token file with a small CSS-custom-property reader (and SCSS/JS token variants per `styling`); when the Figma Desktop Bridge is connected, prefer the **authoritative Figma variables** (`figma_get_variables`) for resolved values, matching the extraction skill. Parse `.sdd-de/components.json` (reuse `detectedComponentsSchema`) and read the generated component source for variants/props/states and token references. All parsing is zod-validated at the boundary only (invariant: no canonical store). *Alternative rejected:* reviving the IR pipeline — deleted, and re-adding it violates invariant #1.

### D2 — Provenance becomes a file-derived **source** model
Replace v1's `inferred | confirmed | pending` (IR confidence) with `figma-variable | generated-code | hand-edited`, derivable from where the value lives (Figma bridge match → figma-variable; present only in code → generated-code; changed via the Inspector's gated editor → hand-edited). Keeps the badge system and colors from the bundle, drops the inference machinery.

### D3 — The Playground is a **generated harness + managed dev server + embedded webview**, not an in-app renderer
Primary mechanism, in order:
1. If the project already exposes a browsable surface (Storybook, or a running dev server with a gallery route), launch it via the managed PTY and embed its URL in a webview (reuse Dev preview / US-10).
2. If not, **have Claude Code generate the harness** (a minimal gallery route or Storybook stories) as a scoped run — the engine writes framework-correct code (it knows the project's stack: React/Vue/Svelte/…), then we launch + embed it. VortSpec never writes framework renderers itself.
This makes the Playground **framework-agnostic** and keeps Claude Code as the engine. It closes the `visual-verify` render-harness gap directly: once the harness exists, live-viewport screenshots and axe can run. *Alternatives rejected:* (a) an in-app sandbox that bundles components per framework — fragile, huge surface, portability risk; (b) static thumbnails only — doesn't let the user validate real rendering or interactions.

### D4 — Modify loop is gated, never silent
Two paths, both gated: (a) **request a change in natural language** → routed through Claude Code via the resumable chat / a scoped run, producing a diff the user approves (spec-first gate, reusing the artifact-gate pattern); (b) **direct token edit** in the Inspector (e.g. change a color value) → written to the token file behind an explicit confirm, recorded as `hand-edited`. Component code edits always go through Claude Code (invariant #1). No mutation happens without a recorded approval.

### D5 — "Where used" via source cross-reference
Build the token→usage map by scanning component source for `var(--token)` / token-utility references (the same references `sync-tokens` audits), not from an IR usage graph. Cheap, file-derived, and consistent with how tokens are actually consumed.

### D6 — Entry point and shell
Add an **Inspector** destination in the app shell, reachable once `components.json` / the token file exist (e.g. from the completion banner's "Open Inspector" and the project view). Tokens / Components / Playground are tabs/sub-views; the modify chat reuses the tabbed run panel.

## Risks / Trade-offs

- **PTY service is deferred/not yet built (PRD §7).** → This change depends on it; sequence the managed-dev-server work first, isolating node-pty behind an adapter so Windows/Linux stays a contained change (matches the stated portability risk).
- **Framework diversity for the harness.** → Never hardcode a renderer; delegate harness generation to Claude Code, which targets the project's actual stack. VortSpec only launches + embeds.
- **Harness generation adds files to the user's project.** → Do it as a gated, transparent step (the user sees and approves the generated harness), git-ignorable, and clearly attributed.
- **Token-file formats vary (CSS vars / SCSS / Tailwind / JS).** → Prefer the Figma-bridge authoritative values when available; the file parser degrades to best-effort per `styling`, and the raw file is always one click away (transparency).
- **Large systems (hundreds of tokens/components).** → Virtualize lists; lazy-render playground previews; the earlier extraction work already surfaces counts (e.g. 95 vars / 216 sets) so the UI must not assume small sets.
- **Re-basing existing specs could drift from the bundle's visuals.** → Keep the bundle as the visual source of record and archive it as the zip-html adapter's first golden fixture; deviations are only where v1 data concepts (IR/inference) no longer exist.

## Migration Plan

- Additive; no breaking changes to the guided flow. Ship behind the existing project/flow navigation.
- Update `docs/vortspec-prd-v2.md`: add §8.7 (user stories) and a milestone entry; supersede the line-152 deferral.
- Re-base `inspector-tokens` and `inspector-components` specs to the v2 file model; add `inspector-playground`.
- Archive `docs/design/` as the design source of record + zip-html adapter fixture.
- Rollback: the Inspector is a viewer; disabling its nav entry removes it with no effect on flow state or project files.

## Open Questions

- Harness form: generate lightweight gallery routes vs. full Storybook? (Lean gallery first; offer Storybook when the project already uses it.)
- Does the Playground live inside the guided-flow view or as a top-level project destination? (Proposed: top-level, linked from the completion banner and flow.)
- How much of Issues/History/Assistant/Graph from the bundle to pull in now vs. later? (This change scopes Tokens + Components + Playground; the rest stays future.)
