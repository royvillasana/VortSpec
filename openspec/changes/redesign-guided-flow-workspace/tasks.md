## 1. Roster status (data layer)

- [x] 1.1 Expose per-component status for the workspace, reusing the inspector reader's derivation (source present → built; visual-verify report → verified/has-issues; else detected). Prefer sharing `getInspectorComponents` output over duplicating logic
- [x] 1.2 Ensure status is fully file-derived (no session Set) so it persists across reopen
- [x] 1.3 IPC/api wrapper the workspace uses to read the roster (name, level, description, status, file, issues)

## 2. Foundation zone

- [x] 2.1 Detect whether the foundation exists (token file + `.sdd-de/components.json`); until then, show today's design-system setup (source → extract → detect)
- [x] 2.2 Once established, collapse to a compact status header (source · N tokens · N components) with a re-extract action that re-runs the design-system step

## 3. Component roster (the centerpiece)

- [x] 3.1 Roster list: every component with its status pill (detected / built / verified / has-issues) and level grouping
- [x] 3.2 Per-row actions: Build (detected), Verify (built), Open in Playground, Modify — routed to the existing runs/screens
- [x] 3.3 Build one = the existing per-component run (`/generate-artifacts` → implement), streamed; roster updates from files on completion
- [x] 3.4 "Add components" menu: Build all detected (remaining unbuilt), Build selected…, + New component…
- [x] 3.5 Build all detected = the existing batch run over the unbuilt set
- [x] 3.6 New component: describe (name + intent) → append `{name, level, description}` to `.sdd-de/components.json`, then build it; on build failure keep the entry as detected/unbuilt (visible + retryable)

## 4. Verification (per-component + batch)

- [x] 4.1 Per-component Verify action (runs `/visual-verify` scoped to it); never automatic
- [x] 4.2 "Verify all built" batch action; results flow back onto the roster from the reports

## 5. Outputs (on-demand)

- [x] 5.1 Manifest card: open/generate the Design Manifest screen; show staleness ("N components added since the approved manifest")
- [x] 5.2 Publish card: optional, de-emphasized ("connect a repo when you're ready to build screens"), reusing setPublishTarget + the commit skill; never gating

## 6. Flow model + shell

- [x] 6.1 Simplify `DEFAULT_FLOW`/`shared/flow.ts` + `flow-manager` to stop encoding a terminal "complete"; keep the manifest approval record + publish target; report progress as counts
- [x] 6.2 Legacy `flow.json` migration: reconcile forward, deriving foundation status from files so in-progress projects open sensibly
- [x] 6.3 Rewrite `GuidedFlow.tsx` into the workspace (foundation header + roster + add-menu + outputs); retire the linear timeline + completion banner. "Flow" rail destination opens the workspace

## 7. Tests & verification

- [x] 7.1 Main-process unit tests: roster status derivation (built/verified/has-issues/detected), new-component append to components.json, flow-manager forward migration (no terminal complete)
- [x] 7.2 Renderer component tests (Playwright CT): foundation collapsed vs setup, roster statuses render, add-components menu (all/selected/new), per-row build/verify actions present, outputs section (manifest staleness, optional publish), no "complete" banner
- [x] 7.3 Recorded-transcript test: build-one and new-component → roster updates to built from files
- [ ] 7.4 End-to-end through the UI on the real generated project: open the workspace, build a remaining component, add a brand-new component, verify one, regenerate the manifest — all without a "complete" dead-end; `pnpm build && pnpm test && pnpm lint` green
