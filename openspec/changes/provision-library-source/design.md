## Context

VortSpec's design sources each land their real source of truth into the project before component work: Figma via the user's MCP, ZIP via file drop + extraction, GitHub via clone (`git-design-source`). The `library` source is the exception — `setup/SKILL.md` Branch B records `component_library` and stops. `extract-design-system/SKILL.md` says non-Figma sources "read the component directory directly," but nothing populates that directory, so `generate-artifacts` Branch B and the 7-step cycle hand-author components using the library as a written reference. Net: generic look-alikes and duplicated work.

The libraries in `COMPONENT_LIBRARY_OPTIONS` (setup.ts) fall into two distribution models that must be handled differently:
- **Copy-source** — `shadcn`, `radix`: a CLI copies component *source files* into your repo. This is a near-perfect fit for SDD-DE (file-based, per-component, token-referenced, spec-and-verify per file).
- **Package** — `mui`, `chakra`, `antd`, `mantine`, `headlessui`: components are imported from `node_modules`. You don't own the files; you compose/theme them.

Constraint carried from the rest of the app: VortSpec provisions through the **user's local toolchain** (npm/npx via the base-tool install), the same way it runs figma-cli and Claude — it never vendors or proxies the libraries.

## Goals / Non-Goals

**Goals:**
- A `design_source: library` project ends `/setup` with the real library artifacts in `component_dir`, so extraction reads real files and the cycle *adapts* rather than *rebuilds*.
- One classification (`copy-source` | `package`) drives which provisioning path runs.
- Provisioning is idempotent/resumable and runs through the user's toolchain.
- The change is skill-first (toolkit) with the minimal VortSpec surface to trigger/observe it — matching how the rest of SDD-DE is authored.

**Non-Goals:**
- Bundling, vendoring, or proxying any library or package manager.
- A visual component picker/marketplace — the initial cut provisions a sensible default component set (and lets the user extend via the CLI directly).
- Re-theming package libraries beyond token mapping (deep theme objects are a follow-up).
- Changing the Figma / ZIP / GitHub flows.

## Decisions

**D1. New capability `library-design-source`, mirroring `git-design-source`.**
Provisioning is source-specific behavior with its own requirements (pull in → scan → build), exactly like the GitHub source. Keeping it a distinct capability (rather than stuffing it into `design-input`) matches the existing shape and keeps `design-input` as the thin "what sources exist + land their truth" contract. *Alternative considered:* fold everything into `design-input` — rejected; it would bloat a deliberately thin capability and diverge from the `git-design-source` precedent.

**D2. Classify libraries in one place: `setup.ts`.**
Add a `kind: "copy-source" | "package"` to each entry in `COMPONENT_LIBRARY_OPTIONS` (shadcn/radix → copy-source; mui/chakra/antd/mantine/headlessui → package; `other` → ask). Both the toolkit skill and the VortSpec UI read the same source of truth. *Alternative:* infer at runtime from the library name — rejected; explicit is testable and avoids drift.

**D3. Provisioning is authored in the toolkit skills; VortSpec provides the trigger + status.**
The heavy lifting (which CLI, which default component set, wrapper generation) lives in the skills so it ships via `@royvillasana/sdd-de` and stays framework-aware. VortSpec adds a guided-flow "Provision library" affordance for `design_source: library` (parallel to "Read Figma components" / the GitHub clone) that runs the step in a scoped Claude/CLI run and reflects progress. *Alternative:* implement provisioning entirely in VortSpec core — rejected; it would duplicate SDD-DE logic and couple the app to per-library specifics.

**D4. Copy-source path = the library's real CLI.**
`shadcn` → `npx shadcn@latest init` (respecting the project's framework/Tailwind/token file) then `add <components>` for a default set (button, input, card, dialog, …). `radix` → install the primitive packages and scaffold styled wrappers (Radix ships unstyled, so it is copy-source only in the "you own the styled file" sense). The copied files ARE the design system; extraction reads them unchanged.

**D5. Package path = install + token-mapped wrappers.**
Install the package (`@mui/material`, `@chakra-ui/react`, …), then generate one thin wrapper per default primitive in `component_dir` that imports the library component and applies project tokens (via the theme mechanism the library uses — MUI/Chakra theme, Mantine CSS vars). Wrappers delegate behavior; they never reimplement it. This keeps the SDD-DE per-component file model intact while honoring that the user doesn't own the library source.

**D6. Extraction and generate-artifacts are updated, not replaced.**
`extract-design-system` already reads the component dir for non-Figma sources — it only needs provisioning to have populated it, plus a guard that prompts to provision when the dir is empty. `generate-artifacts` Branch B is reframed to spec a customization of a named base component (fields already hint at this: `Base component`, `Customization`).

## Risks / Trade-offs

- **A library CLI is interactive / prompts** → run with non-interactive flags (`--yes`, `--defaults`) and a pre-written config; if a CLI can't run headless, surface a fix-it with the exact command for the user to run in the in-app terminal (which now exists).
- **CLI network/version drift breaks provisioning** → pin nothing by default (use `@latest`) but capture the command + output so failures are legible; provisioning is resumable so a retry is safe.
- **Package-library theming is shallow at first** → token-mapped wrappers cover color/spacing/radius/type; deep theme parity is an explicit follow-up, called out as a Non-Goal.
- **Behavioral BREAKING for existing library projects** → no silent migration; existing projects keep their hand-built components until the user re-provisions. Documented in the proposal.
- **`other` libraries can't be auto-provisioned** → ask the kind, and for unknown CLIs fall back to guidance + the terminal rather than guessing a command.

## Migration Plan

1. Ship the classification + skill changes in a toolkit minor release; VortSpec's guided-flow trigger behind the same release.
2. New library projects get provisioning automatically after `/setup`.
3. Existing library projects: a one-line prompt in the guided flow offers to provision now (re-provision is idempotent). No forced rewrite.
4. Rollback: the provisioning step is additive; disabling the flow trigger reverts to today's behavior without data loss.

## Open Questions

- Default component set per library — a fixed sensible list (button/input/card/dialog/…) vs. reading the enriched brief to decide? Start fixed; revisit once the brief step is library-aware.
- For `radix`, is it better modeled as copy-source (styled wrappers we own) or package (primitives we import)? Leaning copy-source since the user owns the styled file; validate during apply.
- Should provisioning offer to add more components later from within the flow, or defer to the user running the CLI in the terminal? Defer initially.
