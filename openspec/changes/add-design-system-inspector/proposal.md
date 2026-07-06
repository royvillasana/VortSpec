# Add Design System Inspector & Playground

## Why

Once the guided SDD-DE flow finishes, the tokens and components it produced are only visible as files on disk or as raw run output — there is no way inside VortSpec to **browse the whole design system** (every token, every component) or to **render components live to confirm they are correct**. The `visual-verify` stage has repeatedly stalled for exactly this reason: nothing in the project renders (no `src/main.tsx`, no Storybook stories, no browser driver), so pixel/a11y validation cannot run and the user cannot see or fix what was built. The user has designed the full surface for this (the `vortspec-design-inspector/` Claude Design bundle) and is now explicitly asking for it. The v1 Inspector specs still describe an IR-normalization world that the pivot deleted, so they must be re-based, not resurrected as-is.

## What Changes

- Add a **Design System Inspector** to the cockpit, reachable from the flow/project once tokens and components exist, with the visual language of the `vortspec-design-inspector/` bundle (dense, Figma-grade, dark, mono values, provenance badges).
- **Tokens view** sourced from the project's real files: parse `token_file` (e.g. `tokens.css`) and, when the Figma Desktop Bridge is connected, the authoritative Figma variables. Group by type (color / typography / spacing / radius / shadow / other) with swatches/specimens, resolved mono values, search/filter, and a "where used" cross-reference into components.
- **Components view + detail** sourced from `.sdd-de/components.json` plus the generated source under `component_dir`: list every component, and per component show its variant matrix, states, props, the tokens it consumes, and links to its spec and `visual-verify` report.
- Add a **Playground** — a Storybook-like surface that renders each *real* component live across its variants/states. This doubles as the **render harness** the `visual-verify` stage currently lacks. Two mechanisms are evaluated in `design.md`; the primary path reuses the Dev preview (US-10) managed-PTY + embedded webview approach (generate/launch Storybook or a component gallery in the project) rather than re-implementing a renderer.
- **Validate & modify:** surface issues (untokenized values, missing states, a11y gaps) by reusing existing `visual-verify` / `adversarial-review` outputs, and let the user request fixes. Modifications are **never silent** — they route through Claude Code (a scoped run or the resumable chat) behind the spec-first gate, or as gated direct edits to the token file, always written back to project files.
- **Re-base provenance:** replace v1's IR "inferred/confirmed" inference model with a v2 source model — a token/component is "from Figma variables", "from the generated code", or "hand-edited" — derivable from files, no normalization store.
- **PRD update:** add functional requirements (new subsection **8.7 Design System Inspector & Playground** with user stories) and a milestone entry to `docs/vortspec-prd-v2.md`, superseding the "Scope temptation… inspector returns only after D4 if usage asks" deferral (line 152), since real usage is now requesting it.
- Archive the `vortspec-design-inspector/` bundle as the design source of record and the zip-html adapter's first golden fixture (per the bundle's own dogfood note).

## Capabilities

### New Capabilities
- `inspector-playground`: a live render harness that renders real generated components across variants/states inside the app (via a managed dev server / Storybook embedded webview), doubling as the render surface for `visual-verify`, plus the validate-and-request-changes loop over that preview.

### Modified Capabilities
- `inspector-tokens`: re-base the Tokens panel from the deleted IR store onto v2 project files (parse `token_file` + Figma variables), and replace IR "inferred/confirmed" provenance with a file-derived source model; keep the grouped-by-type display, detail/edit, and where-used behavior, with edits gated and written to the token file.
- `inspector-components`: re-base the Components panel + detail from IR-rendered previews onto `.sdd-de/components.json` + generated component source, with the live preview delegated to the new `inspector-playground` capability instead of an IR renderer.

## Impact

- **PRD:** `docs/vortspec-prd-v2.md` — new §8.7, milestone entry, deferral note superseded.
- **Renderer:** new Inspector views under `apps/desktop/src/renderer/src/views/` (Tokens, Components, Playground) and app-shell navigation to reach them; reuse of the tabbed run panel / resumable chat for the modify loop.
- **Main process:** token-file + `components.json` parsers (zod at the artifact boundary), a component-source reader, and a managed dev-server/Storybook launcher reusing the Dev preview PTY + webview pattern (deferred `PTY service`, PRD §7). Figma bridge reused for authoritative token values.
- **IPC:** new zod-validated contracts for reading tokens/components/usage and for launching/observing the playground preview.
- **Invariants:** Claude Code stays the engine (no re-implemented normalization or agent logic); local-first (everything derived from project files); spec-first gates before any mutation; transparency (raw file/terminal always reachable). Portability risk stays isolated in the PTY/webview layer.
- **Dependencies:** relates to `dev-preview`, `guided-sdd-flow`, `app-shell`; consumes `visual-verify`/`adversarial-review` outputs.
