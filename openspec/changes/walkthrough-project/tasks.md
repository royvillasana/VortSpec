## 1. Bundle the reference project

- [x] 1.1 Create `apps/ide/resources/walkthrough.tar.gz` from the SDD Base Test project (exclude node_modules/.git/dist/build/tsbuildinfo/.DS_Store and .vortspec run-logs).
- [x] 1.2 Ship it via electron-builder `extraResources` in `apps/ide/package.json`.

## 2. Instantiate it (main + IPC)

- [x] 2.1 `packages/core/src/main/workspace/walkthrough.ts`: resolve the archive path (packaged vs dev) and `extractWalkthrough(destPath)` via `tar -xzf … -C dest` (argument array, confined).
- [x] 2.2 `workspace:openWalkthrough` IPC + preload wrapper + `VortSpecApi` method + CT mock.

## 3. Welcome-screen action

- [x] 3.1 WorkspacePicker: an "Open the walk-through project" action → createFolder → extractWalkthrough → refreshProject → open; report failures.

## 4. Tests

- [x] 4.1 CT: the walk-through action is present on the welcome screen and opens a project (mocked extract → refresh → open).
