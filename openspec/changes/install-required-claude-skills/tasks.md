## 1. Vendor the skills into the toolkit

- [x] 1.1 Copy the 8 design skills into `@royvillasana/sdd-de` at `ai-specs/skills/<id>/`: `ui-ux-pro-max`, `ai-ds-composer`, `ai-component-metadata`, `figma-component-generator`, `figma-variables-generator`, `codebase-index`, `problem-mapping`, `crazy-8s`.
- [x] 1.2 Validate each has a standard `SKILL.md`; exclude `spec-ideation` (`.mdx`) and `magicpath` (empty/external CLI).
- [x] 1.3 Safety-scan the vendored copies: no stray `.git`/`node_modules`/`.env`/`.DS_Store`, no machine-specific home paths, no real secrets (~1.0 MB total, clean).
- [x] 1.4 Confirm `ai-specs/skills/` is in the package `files` allow-list (it is) so the new skills publish.
- [x] 1.5 Confirm delivery is code-free: `setup-manager.createProject` copies the dir and `createSkillSymlinks` links every dir dynamically (verified — no hardcoded list).

## 2. Release (toolkit maintainer)

- [ ] 2.1 Preserve upstream attribution/license files for the third-party skills where present.
- [ ] 2.2 Bump `@royvillasana/sdd-de` version and publish (skills ride the existing `files` allow-list).
- [ ] 2.3 Bump VortSpec's `@royvillasana/sdd-de` dependency to the new version; rebuild the app so the bundled toolkit includes the skills.

## 3. Verify end-to-end

- [ ] 3.1 New project: create via the app → assert the 8 skills appear in the project's `.claude/skills/`.
- [ ] 3.2 Existing project: run the Toolkit Update (`resyncToolkit`) → assert the skills appear after resync.
- [ ] 3.3 Spot-check one skill is actually invoked by Claude in a run (e.g. `ui-ux-pro-max` on a UI task) inside a VortSpec project.

## 4. Follow-ups (separate from this change)

- [ ] 4.1 Marketplace plugins (`vercel`, `figma` MCP) — install via the base prerequisite-install flow (`claude plugin install`), not here.
- [ ] 4.2 `figma-*` skills' `figma-cli` runtime dependency — covered by the Figma-connection install gap, tracked separately.
