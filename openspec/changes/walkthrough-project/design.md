## Context

New users have no way to see a correctly-structured SDD-DE project. The "SDD Base Test" project is a complete reference (DESIGN.md, .sdd-de config/docs/components.json, src components + tokens, .storybook, specs, guidance md files). VortSpec already has `createFolder` (pick an empty dir), `refreshProject` (register + open), and dev-server auto-install (deps install on first Run).

## Goals / Non-Goals

**Goals:** ship the reference project inside the app; one-click extract-into-a-folder + open; reuse the existing open/refresh/install plumbing.

**Non-Goals:** not a per-framework template gallery (one reference for now); not bundling `node_modules` (auto-install handles it); not a guided tour overlay (just open the real project so users explore it).

## Decisions

### D1 — Ship a tarball resource, not 395 loose files
Bundle the project as a single `resources/walkthrough.tar.gz` (excluding `node_modules`/`.git`/build output and session run-logs) via electron-builder `extraResources`. One artifact keeps the repo and the DMG clean; `tar` (argument array, confined `-C dest`) extracts it. Alternative — committing the loose tree — bloats the repo and risks accidental edits to the template.

### D2 — Extract into a user-chosen folder, then open like any project
Reuse `createFolder` for the destination and `refreshProject` to register+open, so the walk-through is a normal local project the user owns and can edit/run/commit. No special-case project type. The bundled archive is never modified.

### D3 — Resolve the archive for dev vs packaged
`app.isPackaged` → `process.resourcesPath/walkthrough.tar.gz`; dev → the source `apps/ide/resources/…` relative to the bundled main. Contained in one `walkthrough` module.

## Risks / Trade-offs

- **[Stale template]** → It's a snapshot; refresh it by rebuilding the tarball from the reference project when the methodology changes. Documented in tasks.
- **[Extraction outside the folder]** → Mitigated: `tar -xzf … -C <dest>` with an argument array, into a user-picked empty folder only.
- **[No node_modules]** → Intentional; the auto-install on first Run brings it up (and demonstrates that flow).
