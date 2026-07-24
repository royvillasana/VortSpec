## 1. Classification (single source of truth)

- [x] 1.1 Add `kind: "copy-source" | "package"` to each entry in `COMPONENT_LIBRARY_OPTIONS` in `packages/core/src/shared/setup.ts` (shadcn/radix → copy-source; mui/chakra/antd/mantine/headlessui → package; other → unresolved)
- [x] 1.2 Export a `libraryKind(library: string): "copy-source" | "package" | "unknown"` helper + a unit test covering each library and `other`
- [x] 1.3 Record the resolved kind in `project.yaml` when writing config (extend `buildProjectYaml`/config-manager to persist `component_library` + kind)

## 2. Toolkit skill: setup Branch B

- [x] 2.1 In canonical `ai-specs/skills/setup/SKILL.md` Branch B, after recording `component_library`, record the provisioning kind (ask when `other`) and hand off to the new provisioning step instead of ending
- [x] 2.2 Add a short "what happens next → provision the library" disclosure so the user knows the real components will be pulled/installed, not rebuilt

## 3. Toolkit skill: new provisioning step

- [x] 3.1 Author provisioning guidance for **copy-source** libraries: run the real CLI through the user's toolchain non-interactively (`npx shadcn@latest init` honoring framework/Tailwind/token file, then `add` a default set: button, input, card, dialog, badge, …); the copied files ARE the design system, no reimplementation
- [x] 3.2 Author provisioning guidance for **package** libraries: install the package, then generate one thin token-mapped wrapper per default primitive in `component_dir` that imports the library component and applies project tokens; wrappers delegate behavior, never reimplement it
- [x] 3.3 Make provisioning idempotent/resumable (skip/refresh already-present components; report what was added) and legible on failure (capture command + output; on non-headless CLIs, surface the exact command to run in the in-app terminal)
- [x] 3.4 Add a `radix` sub-path (install primitives + scaffold styled wrappers the user owns) per the copy-source decision

## 4. Toolkit skill: extract + generate-artifacts

- [x] 4.1 In `extract-design-system/SKILL.md`, add a guard: for `design_source: library` with an empty/unprovisioned `component_dir`, prompt to provision first rather than producing an empty/invented inventory; otherwise read the provisioned files → `components.json` (existing non-Figma behavior)
- [x] 4.2 In `generate-artifacts/SKILL.md` Branch B, reframe the component spec to a customization/wrapping of a named **provisioned base component** (scope tasks to overrides/props/tokens, not from-scratch build)
- [x] 4.3 Update `CLAUDE.md`'s library-flow description to state that library components are provisioned + adapted, not rebuilt

## 5. VortSpec surface (trigger + status)

- [ ] 5.1 Add a "Provision library" affordance in the guided flow for `design_source: library` (parallel to "Read Figma components" / the GitHub clone), gated so component work prompts to provision when unprovisioned
- [ ] 5.2 Run provisioning through a scoped Claude/CLI run in the user's environment (reuse the existing run plumbing; no bundled package managers beyond base-tool install); reflect progress + surface a fix-it on failure
- [ ] 5.3 Detect "provisioned" state from `component_dir` contents / `components.json` so the flow shows the right next step

## 6. Verification

- [x] 6.1 Unit tests: `libraryKind` classification + config persistence of `component_library` + kind
- [ ] 6.2 End-to-end (copy-source): create a shadcn project, run provisioning, confirm the REAL shadcn source files land in `component_dir`, extraction builds `components.json` from them, and no from-scratch Button is generated
- [ ] 6.3 End-to-end (package): create an MUI project, run provisioning, confirm the package installs and token-mapped wrappers are generated that import from the library
- [ ] 6.4 Idempotency: re-run provisioning; confirm existing components are untouched and the report lists nothing new
- [ ] 6.5 Confirm the guided flow blocks/nudges component work until a library project is provisioned

## 7. Ship

- [ ] 7.1 Bump + publish the toolkit (`@royvillasana/sdd-de`) with the setup/extract/generate-artifacts/provisioning changes
- [ ] 7.2 Bump VortSpec's toolkit dep and land the guided-flow trigger behind the same release
