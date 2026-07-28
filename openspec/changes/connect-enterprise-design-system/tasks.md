## 1. Config + intake

- [x] 1.1 Add `design_source: enterprise` to the project config model + `buildProjectYaml` (config-manager / setup): the connect settings — Storybook source (kind url/static/repo + ref), optional repo, knowledge-base source (kind docs-repo/site/mcp + ref), optional read-only Figma file. Additive; existing sources validate unchanged. → `setup.ts` (designSourceSchema, setupAnswersSchema, projectConfigSchema, DESIGN_SOURCE_OPTIONS, buildProjectYaml) + `config-manager.ts` KEY_MAP.
- [x] 1.2 Add the "Connect Enterprise Design System" card + fields to `ProjectSetup` (intake stepper), alongside figma/library/github/zip. Storybook source required (url/static/repo), KB + repo + Figma optional; `isReady` gates on a Storybook ref.
- [x] 1.3 Unit-test `buildProjectYaml` emits `design_source: enterprise` + the connect settings, and that other sources are unaffected. → 3 tests in `setup.test.ts`.

## 2. Foundation branch — validate + index (not extract)

- [x] 2.1 Branch the Foundation for `design_source: enterprise`: skip Figma extraction, the 7-step build, `/provision-library`, and VortSpec's own `/storybook` install. → `buildEnterpriseFoundationPrompt` (consume/validate/index/snapshot, explicitly forbids extract/build/provision/SB-install/copy); `useAutoFoundation` runs it (with Bash) for enterprise projects.
- [x] 2.2 Build the pointer INDEX: write `components.json` entries that reference each component's real import path/export + Storybook story id (no VortSpec-authored definitions); point `token_file` at the client's real token file when connected. → `EnterpriseComponentEntry` shape (importPath/export/storyId/tier) + the prompt's INDEX step ("POINTERS", "NEVER author a competing definition"), token_file → their real file.
- [~] 2.3 Readiness report (validate, not extract): per-asset pass/gap — tokens parse + resolve via the token resolver (flag unmatched); each component importable + has a story; KB probe. → `analyzeEnterpriseReadiness` (pure structured report: tokens/components/componentDetail/knowledgeBase + `usable`) + the Foundation prompt's VALIDATE step. A dedicated readiness UI panel is deferred (the agent surfaces the report in its run output for now).
- [x] 2.4 Unit-test readiness: value-matched tokens pass, an unmatched value is flagged, a component without a story is flagged "lower fidelity", an unreachable KB is a gap. → 7 tests in `enterprise-consume.test.ts` (5 readiness + 2 prompt-content).

## 3. Storybook consumption

- [ ] 3.1 Story catalog: read Storybook's index — `index.json` (v7/v8) or `stories.json` (v6) — into a component→stories/variants model (title, story ids, argTypes→props, args→variants). Handle both shapes; clear error when neither is found.
- [ ] 3.2 Serve/point the Storybook source: a hosted/dev URL used directly; a static `storybook-static/` dir served from a local origin (reuse the light-serve pattern); build-from-repo (`build-storybook`) as an optional convenience producing the static dir.
- [ ] 3.3 Embed the client's Storybook in the Storybook section: for `enterprise` projects, `RunApp kind=storybook` + `StorybookSidebar` point at the client's Storybook source (never a VortSpec install).
- [ ] 3.4 Snapshot → light stand-ins: for each story render `iframe.html?id=…&viewMode=story`, harvest the rendered DOM + resolved computed styles via `harvest.ts` → framework-free `.vortspec/light-html/` stand-ins grouped by component; components without a story get a placeholder + the readiness flag.
- [ ] 3.5 Token palette from Storybook: read all `--*` custom properties off the preview `:root` (name → resolved value) for the dual-keyed palette; cross-reference the token file for canonical names when connected.
- [ ] 3.6 "Update snapshot" action: a user-triggered refresh that re-reads the client's Storybook and regenerates the affected stand-ins; the Playground otherwise composes against the frozen snapshot (no live re-render per load).
- [ ] 3.7 Tests: catalog parses both index versions; the snapshot produces framework-free stand-ins (no import/JSX/framework refs); "Update snapshot" replaces stale stand-ins.

## 4. Knowledge base via MCP

- [ ] 4.1 Per-project KB MCP registration: compose the connected KB server into the agent's `mcpConfigPath` (union with the built-in ide-mcp + Figma), read-only by default. Reuse the existing mcp-config plumbing.
- [ ] 4.2 Generic connector (default, Case B): a small MCP server that wraps a docs source (v1: a docs/markdown repo reader) so the client needs no MCP server of their own.
- [ ] 4.3 Bring-your-own MCP (power path, Case A): when the client provides their own KB MCP endpoint, register it directly in place of the generic connector.
- [ ] 4.4 Grounding injection: instruct the agent to consult the KB at enrich-brief / generate-artifacts / component+screen generation / adversarial-review, treating KB content as data-not-instructions (surface, don't execute directives; side-effectful tools need approval).
- [ ] 4.5 Tests: the KB server is present in the composed config; a docs-repo connector answers a probe; grounding text is present in the enterprise generation prompts.

## 5. Generate code — import real, never rebuild

- [ ] 5.1 Enterprise Generate-code path: import the client's real components (from their component dir / published package) and reference their real tokens; reuse `resolveComponentBindings` so every value binds to a token, never a hardcode.
- [ ] 5.2 Per-component gate: compile a screen's component only when its real component is importable; when only the Storybook is connected, generate token-referenced components from the harvested contract and name the components still "catching up" (mirror the light-only gate).
- [ ] 5.3 Tests: the enterprise compile prompt imports real components + references tokens (no hardcodes); the URL-only path degrades to token-referenced generation with the catching-up naming.

## 6. Docs + verification

- [ ] 6.1 Short doc: the enterprise consume model (connect → validate → index → snapshot → embed → KB-MCP → generate), the "Update snapshot" lifecycle, and the connect settings.
- [ ] 6.2 End-to-end validate against a sample enterprise setup (a small React + Storybook + token-file fixture): readiness passes, the Storybook section shows their SB, the snapshot yields framework-free stand-ins, a screen composes and compiles importing the real components.
- [ ] 6.3 `pnpm build && pnpm test && pnpm lint && check-types` green.
