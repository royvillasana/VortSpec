## Why

A brand-new user opens VortSpec to an empty workspace picker and has to create or clone a project before they can see how anything works. There's no way to *learn the SDD-DE structure* — what `DESIGN.md`, `.sdd-de/`, tokens, components, Storybook, and specs look like in a real project. Shipping a complete reference project as a one-click walk-through lets them explore a correctly-structured SDD-DE project immediately.

## What Changes

- Bundle the **"SDD Base Test"** project (a complete SDD-DE reference: `DESIGN.md`, `.sdd-de/` config + docs + components.json, `src/` components + tokens, `.storybook/`, `specs/`, and the `AGENTS/CLAUDE/GEMINI/codex.md` guidance files) as an app resource (a `walkthrough.tar.gz`, without `node_modules`/`.git`/build output).
- Add a **"Open the walk-through project"** action to the welcome screen (WorkspacePicker) — it copies the bundled reference into a folder the user picks and opens it as a normal project.
- Extraction is a main-process step confined to the chosen folder; the project then behaves like any other (the dev-server auto-install brings up its dependencies on first Run).

## Capabilities

### New Capabilities
- `walkthrough-project`: bundling the SDD-DE reference project and instantiating it (extract → open) from the welcome screen so users can learn the expected project structure.

### Modified Capabilities
<!-- No spec-level requirement changes; the walk-through reuses createFolder / refreshProject / open. -->

## Impact

- **`apps/ide`:** ship `resources/walkthrough.tar.gz` via electron-builder `extraResources`; a "walk-through" action on the WorkspacePicker.
- **`packages/core`:** a `walkthrough` module (resolve the bundled archive for dev vs packaged, extract it into a destination folder) + a `workspace:openWalkthrough` IPC.
- **Reused:** `createFolder` (pick an empty destination), `refreshProject` (register + open), the dev-server auto-install (deps install on first Run).
- **Invariants upheld:** local-first (the copy lives in the user's own folder as plain files); safe process handling (extraction is confined to the chosen folder, argument-array `tar`, no shell interpolation); the user's own Claude (nothing bundled requires an account).
