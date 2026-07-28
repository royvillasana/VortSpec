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

- [x] 3.1 Story catalog: read Storybook's index — `index.json` (v7/v8) or `stories.json` (v6) — into a component→stories/variants model. → `storybook-catalog.ts` `parseStorybookIndex` (both shapes, docs entries skipped, grouped by title) + `componentNameFromTitle` + `storyIframeUrl`; 5 tests. (arg/argType → prop/variant mapping deferred; captured in design Open Questions.)
- [x] 3.2 Serve/point the Storybook source: a hosted/dev URL used directly; a static `storybook-static/` dir served from a local origin. → `enterprise-source.ts` `resolveEnterpriseStorybookUrl` (url → as-is; static → `serveStaticDir` path-guarded http server) + `enterprise:storybookUrl` IPC (RunApp uses it). build-from-repo is the noted convenience (design D7), not wired.
- [x] 3.3 Embed the client's Storybook in the Storybook section: for `enterprise` projects, `RunApp kind=storybook` + `StorybookSidebar` point at the client's Storybook source (never a VortSpec install). → RunApp uses the client's Storybook URL as `embedUrl` for an enterprise URL source and skips starting a VortSpec dev server. (Static/repo sources need serving — see 3.2.)
- [x] 3.4 Snapshot → light stand-ins: for each story render `iframe.html?id=…&viewMode=story`, harvest the rendered DOM + resolved computed styles → framework-free `.vortspec/light-html/` stand-ins; no-story → placeholder. → `buildEnterpriseSnapshotPrompt` (per-component story URLs, framework-free capture, placeholder for no story) + `buildEnterpriseSnapshotPromptFor` (resolve URL + fetch catalog → first story per component). Agent-driven harvest, consistent with the Foundation.
- [x] 3.5 Token palette from Storybook: read all `--*` custom properties off the preview `:root` (name → resolved value). → the snapshot prompt's TOKENS step (dual-keyed; "reference them, never redefine them").
- [x] 3.6 "Update snapshot" action: a user-triggered refresh that re-reads the client's Storybook and regenerates the stand-ins; the Playground otherwise composes against the frozen snapshot. → `enterprise:snapshotPrompt` IPC + an "Update snapshot" button in the Storybook header (enterprise), run via its own agent run.
- [x] 3.7 Tests: catalog parses both index versions; the snapshot prompt yields framework-free stand-ins + reads `:root` tokens. → 5 catalog tests + snapshot-prompt tests in `enterprise-consume.test.ts`.

## 4. Knowledge base via MCP

- [~] 4.1 Per-project KB MCP registration: compose the connected KB server into the agent's `mcpConfigPath`. → `buildKbMcpServerEntry` produces the `.mcp.json` server entry; composing it into the agent run's `mcpConfigPath` (renderer/ConversationTabs) is the remaining wiring (follow-up).
- [x] 4.2 Generic connector (default, Case B): a docs source wrapper so the client needs no MCP server. → `buildKbMcpServerEntry` docs-repo → `@modelcontextprotocol/server-filesystem` over the cloned repo (site → `server-fetch`).
- [x] 4.3 Bring-your-own MCP (power path, Case A): the client's own KB MCP endpoint used directly. → `buildKbMcpServerEntry` `mcp` kind → `{ url }`.
- [x] 4.4 Grounding injection: consult the KB at enrich/generate/review, treating content as data-not-instructions. → `buildKbGroundingClause` (read-only, surface-don't-execute) appended to the enterprise Foundation prompt; reused by the generate step.
- [x] 4.5 Tests: entry shapes (docs-repo/mcp/null), grounding content, empty-when-no-KB. → covered in `enterprise-consume.test.ts`.

## 5. Generate code — import real, never rebuild

- [x] 5.1 Enterprise Generate-code path: import the client's real components + reference their tokens (no hardcode). → `buildEnterpriseGeneratePrompt` (import from the pointer index, token-referenced, AUDIT + VISUAL-VALIDATE) + `enterprise:generatePrompt` IPC.
- [x] 5.2 Per-component gate: compile only when the real component is importable; else a token-referenced "catching up" component. → the prompt's step 3 (per-component gate, mirrors the light-only gate).
- [x] 5.3 Tests: imports real + references tokens (no hardcodes); URL-only degrades to token-referenced "catching up". → in `enterprise-consume.test.ts`.

## 6. Docs + verification

- [ ] 6.1 Short doc: the enterprise consume model (connect → validate → index → snapshot → embed → KB-MCP → generate), the "Update snapshot" lifecycle, and the connect settings.
- [ ] 6.2 End-to-end validate against a sample enterprise setup (a small React + Storybook + token-file fixture): readiness passes, the Storybook section shows their SB, the snapshot yields framework-free stand-ins, a screen composes and compiles importing the real components.
- [ ] 6.3 `pnpm build && pnpm test && pnpm lint && check-types` green.
