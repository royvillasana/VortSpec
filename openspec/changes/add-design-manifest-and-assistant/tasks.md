## 1. Flow stage

- [x] 1.1 Add a `design-manifest` stage to `DEFAULT_FLOW` in `shared/flow.ts` (after verification, before publish): gated, `artifactGlob` for the manifest, kind that runs the `design-doc` skill
- [x] 1.2 Render the new stage in `GuidedFlow.tsx` (timeline entry, artifact chip `DESIGN.md`, gate CTA → open manifest), matching the flow mockup
- [x] 1.3 Wire the stage's approval into existing flow-manager gate/approval so Publish is unlocked only after manifest approval

## 2. Manifest data layer (main)

- [x] 2.1 `manifest-reader.ts`: resolve the manifest path (`DESIGN.md` → `.sdd-de/design.md` → `design.md`), read content, return `{ path, content, exists }`
- [x] 2.2 Gated write: save edited manifest content back to the resolved path
- [x] 2.3 Version store under `.vortspec/manifests/`: snapshot on generate/edit/approve; `index.json` with `{ timestamp, runId?, approved }`; list/read/restore
- [x] 2.4 IPC contracts + handlers + preload + renderer api: `manifest:get`, `manifest:save`, `manifest:listVersions`, `manifest:readVersion`, `manifest:restoreVersion`, `manifest:snapshot`
- [x] 2.5 Zod schemas at the boundary for the manifest result + version list

## 3. Manifest generation (engine)

- [x] 3.1 `design-doc` run wrapper: start Claude Code with the skill invocation, cwd-confined, `bypassPermissions`; observe completion via the run model
- [x] 3.2 On completion, snapshot + re-read the manifest; on error surface the run output as a fix-it (no hang), reusing the Storybook auto-run/timeout patterns

## 4. Design Manifest screen (renderer)

- [x] 4.1 `DesignManifest.tsx` scaffold from `Design Manifest.dc.html`: ProjectRail + header (path chip, Rendered/Markdown toggle) + scrollable body + sticky action bar
- [x] 4.2 Rendered view: parse the manifest markdown with the existing Markdown renderer (headings, tables, lists, code); frontmatter → compact metadata strip
- [x] 4.3 Markdown view: line-numbered raw source with the file bar (Copy, Download)
- [x] 4.4 Copy-to-clipboard + Download; toast confirmations (design's toast pattern)
- [x] 4.5 Inline Edit: editable source textarea → gated save (snapshot-first)
- [x] 4.6 Version panel: list versions, view a version (read-only), restore (gated)
- [x] 4.7 Sticky action bar states: review (Regenerate / Copy / Approve), regenerating (spinner + run), approved (✓ + Publish link)
- [x] 4.8 Empty state when no manifest yet → Generate CTA
- [x] 4.9 Add the manifest destination to the shell (App.tsx projectView union) + ProjectRail/flow links

## 5. Assistant dock (renderer + shell)

- [x] 5.1 Shared `AssistantDock` component: right-side collapsible panel reusing `useAgentRun`/`RunPanel` chat; project-scoped cwd; session starts on first send only (no usage on mount)
- [x] 5.2 Top-bar chat toggle in `App.tsx`; dock overlays every project screen; open/closed persists for the session
- [x] 5.3 Reset the assistant session when the active project changes
- [x] 5.4 Manifest screen entry point that opens the dock pre-scoped to refining `DESIGN.md`

## 6. Background / visual alignment

- [ ] 6.1 Audit screens against the design's exact values (`#0B0C0E` main, `#141518` panels, `#08090B` code, `#26282D` borders) and fix mismatches
- [ ] 6.2 Fix the Playground/Storybook white surround so the VortSpec frame uses `vs-bg-primary` (keep the Storybook canvas itself white)

## 7. Tests & verification

- [x] 7.1 Main-process unit tests: manifest-reader path resolution, gated save, version snapshot/list/restore (Vitest, fixture project)
- [x] 7.2 Renderer component tests (Playwright CT): rendered/markdown toggle, copy, edit-save, version restore, approve gate; assistant dock toggle + first-send starts a session
- [ ] 7.3 Recorded-transcript test for the `design-doc` generation → read → render path
- [ ] 7.4 End-to-end through the UI on the real generated project: generate `DESIGN.md`, view both modes, edit + restore a version, approve; `pnpm build && pnpm test && pnpm lint` green
