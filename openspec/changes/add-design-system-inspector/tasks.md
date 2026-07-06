## 1. PRD & design source of record

- [x] 1.1 Add §8.7 "Design System Inspector & Playground" to `docs/vortspec-prd-v2.md` with user stories (browse tokens, browse components, live playground/render harness, validate & gated-modify)
- [x] 1.2 Add/adjust a milestone entry for the Inspector & Playground and supersede the line-152 "inspector returns after D4 if usage asks" deferral note
- [ ] 1.3 Archive `vortspec-design-inspector/` as the design source of record and note it as the zip-html adapter's first golden fixture

## 2. Data sourcing (main process, files → typed models)

- [x] 2.1 Token-file parser: read the configured `token_file` (CSS custom properties first; SCSS/JS variants per `styling`) into a typed token list (name, type, resolved value), zod-validated at the boundary
- [ ] 2.2 Figma-authoritative reconciliation: when the Desktop Bridge is connected, pull resolved values via `figma_get_variables` and reconcile with the token file, flagging drift
- [ ] 2.3 Source model: classify each token as `figma-variable` / `generated-code` / `hand-edited` from where its value lives
- [ ] 2.4 Component reader: parse `.sdd-de/components.json` (reuse `detectedComponentsSchema`) and read generated source under `component_dir` for variants, states, and source-declared props
- [ ] 2.5 Where-used index: scan component source for token references (`var(--token)` / token utilities) to build the token→usage map
- [ ] 2.6 Verify-report reader: parse `specs/*/visual-verify-report.md` (+ adversarial-review) into per-component status (built / verified / has-issues) and issue lists

## 3. IPC contracts (zod, main↔renderer)

- [ ] 3.1 Add `inspector:getTokens`, `inspector:getComponents`, `inspector:getTokenUsage`, `inspector:getComponentIssues` channels + handlers
- [ ] 3.2 Add gated token-edit channel `inspector:setTokenValue` (writes token file, marks `hand-edited`)
- [ ] 3.3 Wire preload bridge + renderer `api` wrappers for all of the above

## 4. Managed preview substrate (Playground infra)

- [ ] 4.1 Implement the managed PTY dev-server launcher behind an adapter (isolate node-pty; reuse Dev preview / US-10 pattern), detecting the project's dev/storybook script
- [ ] 4.2 Embedded webview panel that renders the local dev-server/Storybook URL with an "open in browser" escape hatch and terminal/log access
- [ ] 4.3 Harness detection: determine whether the project already exposes a browsable surface (Storybook or a gallery route)
- [ ] 4.4 Harness generation via Claude Code: a scoped run that writes framework-correct harness files (gallery route or stories), shown to the user and written transparently (git-ignorable) — VortSpec writes no renderer code itself

## 5. Renderer — Tokens view

- [x] 5.1 Tokens panel: grouped-by-type list (color/typography/spacing/radius/shadow/other) with swatches/specimens, mono values, source badges, search/filter — bundle visual language
- [ ] 5.2 Token detail: value editor + where-used listing (from the usage index); gated value edit that writes to the token file and re-marks source
- [ ] 5.3 Rename/merge/delete/promote routed through the gated modify loop (Claude Code diff approval), never silent

## 6. Renderer — Components view + detail

- [ ] 6.1 Components grid: cards from `components.json` + source (name, level, preview, status from verify reports)
- [ ] 6.2 Component detail: variants/states/props (from source), tokens consumed, links to spec + visual-verify report; preview delegated to the Playground
- [ ] 6.3 Prop controls generated from source-declared props (variant/enum → select, boolean → toggle, string → text)

## 7. Renderer — Playground (render harness + validate/modify)

- [ ] 7.1 Playground surface: embed the live preview, variant/state controls that drive the real component, virtualized for large sets
- [ ] 7.2 "Generate a harness" flow for projects with no renderable surface (invokes task 4.4), then launch + embed — closing the `visual-verify` render-harness gap
- [ ] 7.3 Validation panel: show issues from the verify reports alongside the preview
- [ ] 7.4 Gated modify loop: request a fix → scoped Claude Code run / resumable chat → approvable diff → written only on approval (reuse the artifact-gate + tabbed run panel)

## 8. Shell & entry points

- [x] 8.1 Add an Inspector destination in the app shell, reachable once the token file / `components.json` exist
- [x] 8.2 Link into the Inspector from the flow completion banner ("Open Inspector") and the project view

## 9. Tests & verification

- [ ] 9.1 Main-process unit tests: token-file parser, source classifier, where-used index, verify-report reader (Vitest, fixture files)
- [ ] 9.2 Renderer tests for Tokens/Components views over fixture data (Playwright or component tests)
- [ ] 9.3 Recorded-transcript / fixture-based test for the harness-generation + preview path
- [ ] 9.4 End-to-end through the UI: open the Inspector on a real generated project, browse all tokens + components, render Button in the Playground, run the gated modify loop once; `pnpm build && pnpm test && pnpm lint` green
