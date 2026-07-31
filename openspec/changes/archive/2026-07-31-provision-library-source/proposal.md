> **SUPERSEDED & FOLDED (2026-07-31) → `consume-component-libraries`.** This change delivered the first
> library-provisioning pass (the `copy-source | package` taxonomy, the provisioning skill, the guided-flow
> trigger, the extract guard). `consume-component-libraries` folds it in and supersedes it: the taxonomy is
> replaced by the richer `cli-registry | installed-package | headless` (with `normalizeLibraryKind` mapping
> the legacy `copy-source`→`cli-registry` / `package`→`installed-package`), consuming-over-rebuild is
> enforced app-wide via `isConsumeSource`, and the remaining e2e verification (tasks 6.2–6.4) moves to that
> change's §13. Archived so the shared seams (`setup.ts` `libraryKind`/`buildProjectYaml`, the guided-flow
> provision affordance, the extract skill) are touched by one change, not two.

## Why

When a user picks a component library (shadcn/ui, MUI, Chakra, …) as the design source, VortSpec records the choice in `project.yaml` but **never provisions the real components** — no library CLI runs, nothing is installed. The `extract-design-system` skill then reads an empty `component_dir`, so the 7-step cycle rebuilds every component from scratch using the library only as a written reference. The result is generic components that merely resemble the library instead of the real ones, plus wasted work re-creating what the library's own CLI already ships. The `git` and `zip` sources both pull their real source in first (see `git-design-source`); `library` is the one source with no provisioning step.

## What Changes

- Add a **library-provisioning step** that runs after `/setup` (design_source: library) and before component work, so `component_dir` holds the real library artifacts before extraction.
- Split the library list into two **provisioning kinds**, because they are fundamentally different:
  - **Copy-source libraries** (`shadcn`, `radix`) — the CLI copies component *source files* into the repo. Provision by running the real CLI (`npx shadcn@latest init` + `add`); the copied files become the design system the SDD-DE pipeline reads and specs — **no rebuild**.
  - **Package libraries** (`mui`, `chakra`, `antd`, `mantine`, `headlessui`) — components are imported from `node_modules`, not owned as files. Provision by installing the package and generating thin, **token-mapped wrapper components** in `component_dir` that re-export/compose the library primitives — never reimplementations.
- Update the toolkit skills so the flow reflects this: `extract-design-system` reads the provisioned files (already its non-Figma behavior — it just needs the files to exist), and `generate-artifacts` Branch B specs a *wrapper/customization* of a real base component rather than a from-scratch build.
- **BREAKING (behavioral):** a `library` project no longer hand-builds library components; it provisions and adapts them. Existing library projects are unaffected until re-provisioned.

## Capabilities

### New Capabilities
- `library-design-source`: Provision a component library as the design source — run the real CLI for copy-source libraries, install + wrap for package libraries — so the SDD-DE pipeline reads and adapts real components instead of rebuilding generic look-alikes.

### Modified Capabilities
- `design-input`: The design-source contract gains a library-provisioning outcome — selecting a library at setup SHALL result in the real library artifacts landing in `component_dir`, parallel to how the Figma/ZIP/GitHub sources land their source of truth.

## Impact

- **Toolkit skills** (`@royvillasana/sdd-de`): `setup/SKILL.md` (Branch B records provisioning kind + triggers provisioning), new provisioning guidance in `extract-design-system/SKILL.md`, `generate-artifacts/SKILL.md` Branch B (wrapper/customization framing), and CLAUDE.md's library-flow description.
- **VortSpec core/UI**: the guided-flow "provision" affordance for `design_source: library` (parallel to "Read Figma components" / the GitHub clone), running the CLI through the user's own environment (no bundled package managers beyond what base-tool install provides). `setup.ts` gains a `libraryKind` (copy-source | package) classification for the library options.
- **Config**: `project.yaml` records `component_library` (exists) plus the resolved provisioning kind; `components.json` is produced from the provisioned files.
- **Constraint preserved:** VortSpec runs the library CLI via the user's local toolchain (npm/npx), the same way it runs figma-cli/Claude — it does not vendor or proxy the libraries.
