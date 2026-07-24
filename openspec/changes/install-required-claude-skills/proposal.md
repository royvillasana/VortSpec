## Why

VortSpec's design workflow depends on a set of Claude Code **skills** that today only exist because the developer installed them by hand into their global `~/.claude/skills/`: `ui-ux-pro-max`, `ai-ds-composer`, `ai-component-metadata`, `figma-component-generator`, `figma-variables-generator`, `codebase-index`, `problem-mapping`, `crazy-8s`. On a fresh machine none exist, so the same in-app actions silently degrade — Claude answers without the specialized skill loaded.

Rather than detect-and-install these into the user's global config (a manifest, per-source installers, clobber/backup handling for shared config), we take the **lowest-effort, same-impact route**: **vendor the skills into the SDD-DE toolkit** (`@royvillasana/sdd-de`). The toolkit already copies `ai-specs/skills/*` into every project's `.sdd-de/` and symlinks each into that project's `.claude/skills/` — and it does so **dynamically over the directory**, with no hardcoded skill list. Dropping the skills into the toolkit means they ship and install with everything else, project-scoped, using machinery that already works — zero new install code, no mutation of the user's global config.

## What Changes

- **Vendor 8 design-intelligence skills into the toolkit** at `ai-specs/skills/<id>/` (SKILL.md + supporting files). They become part of VortSpec's toolkit — "made our own" — instead of a third-party global dependency.
- **Delivery reuses the existing toolkit install path** (`setup-manager.createProject` copies `ai-specs/skills` and `createSkillSymlinks` links each dir into `.claude/skills`). New projects get them on create; existing projects get them via the Toolkit Update banner (`resyncToolkit`). **No VortSpec app code changes.**
- **Shipping** is a normal toolkit release: bump + publish `@royvillasana/sdd-de`, bump VortSpec's dependency. (Release is the maintainer's step.)
- **Out of scope here:** the marketplace **plugins** (`vercel`, the `figma` MCP) — they aren't skill directories and can't be vendored the same way; they stay with the base prerequisite-install flow. The `spec-ideation` and `magicpath` skills are excluded (non-standard `.mdx` format; empty + external-CLI dependency, respectively).

## Capabilities

### New Capabilities
- `design-skills`: the design-intelligence Claude Code skills VortSpec ships, bundled in the SDD-DE toolkit and delivered into each project's `.claude/skills/` by the toolkit's existing install/resync — project-scoped, with no global-config mutation.

### Modified Capabilities
<!-- No app-level spec change: delivery reuses `workspace-toolkit`'s existing per-project
     skill copy + symlink, which already iterates the skills directory dynamically. -->

## Impact

- **Toolkit (`@royvillasana/sdd-de`):** +8 skill directories under `ai-specs/skills/` (~1.0 MB total); already covered by the package's `files: ["ai-specs/skills/", …]` allow-list, so they publish automatically.
- **`packages/core` / `packages/ui`:** none — `createProject` + `createSkillSymlinks` pick up new skill dirs without changes; `resyncToolkit` refreshes existing projects; `ToolkitUpdateBanner` prompts the update.
- **Invariants upheld:** the user's own Claude Code (no key, no account); the user's **global** `~/.claude/` is never touched — skills are project-scoped; third-party skills are deliberately vendored with attribution/licensing respected.
- **Trade-off vs. global install:** skills are available inside VortSpec projects (exactly where VortSpec needs them), not in the user's global Claude for arbitrary folders — an acceptable, intentional scope for far less machinery.
