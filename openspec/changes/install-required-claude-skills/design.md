## Context

VortSpec needs a set of Claude Code design skills present when working in a project. They currently live only in the developer's global `~/.claude/skills/`. We want them to arrive automatically on any machine, with the least new machinery.

## Goals / Non-Goals

**Goals**
- Ship the design skills as VortSpec-owned content ("make them our own").
- Reuse the toolkit's existing per-project skill install; add no new install code.
- Never touch the user's global Claude config.

**Non-Goals**
- No global `~/.claude/` manifest, detection, or clobber/backup handling.
- No plugin management here (`vercel`, `figma` MCP stay with prerequisite-install).
- No app-level code changes.

## Decisions

### D1 — Vendor into the SDD-DE toolkit, not the user's global config

The toolkit (`@royvillasana/sdd-de`) already copies `ai-specs/skills/*` into `.sdd-de/` and symlinks each into a project's `.claude/skills/`. Placing the skills at `ai-specs/skills/<id>/` reuses that path end to end. Chosen over a global-config installer because it needs **zero** new code and never mutates shared user config. Chosen over a brand-new toolkit/package because SDD-DE's copy+symlink+version+update machinery already exists.

### D2 — Delivery is dynamic, so this is content-only

`setup-manager.createProject` does `cp(pkg/ai-specs/skills → .sdd-de/ai-specs/skills)` and `createSkillSymlinks` does `readdir(...)` and links every directory. New skill dirs are picked up with no code change; `resyncToolkit` refreshes existing projects; `ToolkitUpdateBanner` surfaces the update. Verified against the current `setup-manager.ts`.

### D3 — Set selection: standard skills only, plugins excluded

Included (have a valid `SKILL.md`): `ui-ux-pro-max`, `ai-ds-composer`, `ai-component-metadata`, `figma-component-generator`, `figma-variables-generator`, `codebase-index`, `problem-mapping`, `crazy-8s`. Excluded: `spec-ideation` (`.mdx`, not a Claude Code skill), `magicpath` (empty payload + external CLI/account), and the marketplace plugins `vercel` / `figma` (not skill dirs). The `figma-*` skills still assume `figma-cli` at runtime — that dependency is handled by the Figma-connection flow, unchanged.

### D4 — Project scope is an accepted trade-off

Skills become available inside VortSpec projects (where VortSpec runs), not in the user's global Claude for arbitrary folders. This is the intended scope and is the reason the machinery is so light.

## Risks / Trade-offs

- **Toolkit size** grows ~1.0 MB (mostly `ui-ux-pro-max`'s data tables). Acceptable; still copied per project.
- **Third-party provenance.** `ui-ux-pro-max`, `crazy-8s`, `problem-mapping`, `codebase-index` originate outside VortSpec; vendoring is a deliberate "make our own" decision — keep any upstream attribution/license files intact when present.
- **Staleness.** Vendored copies won't track upstream updates; refreshed only when we re-vendor + re-release. Fine for owned content.
- **`figma-*` runtime dep.** Those skills need `figma-cli`; that install gap is separate (Figma-connection flow), not introduced here.

## Open Questions

- Should the `figma-component-generator` / `figma-variables-generator` skills be gated to Figma-source projects, or always present? (Currently always, like all toolkit skills.)
- Do we want a periodic re-vendor step to pull upstream improvements for the third-party skills, or treat them as frozen forks?
