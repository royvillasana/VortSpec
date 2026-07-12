## Why

When a user clones a repo and hits Run, it can fail for a hundred reasons — a missing `.env`, an unset database URL, a wrong Node version, a framework misconfig — and today they're stuck reading a console stack trace. VortSpec's whole premise is "Claude Code is the engine": instead of hand-coding a fix for every framework/DB/env, we should capture the failure and hand it to the user's own Claude Code to diagnose and fix, gated behind one click.

## What Changes

- The Run view gains a **Run Doctor**: it activates when the app **fails to start** (dev-server non-zero exit) or **crashes at runtime** (an uncaught error in the previewed app), and shows the captured error.
- **Runtime error capture:** the Run-Canvas guest reports uncaught errors / unhandled rejections (message + source:line + stack) to the host, so runtime crashes (not just dev-server failures) are diagnosable.
- **Tier 1 — deterministic quick-fixes** (instant, no Claude): reuse the missing-`.env` helper and auto-install, plus detect **placeholder / empty required env vars** and prompt to fill them.
- **Tier 2 — "Fix with Claude" (one-click, gated):** bundle the diagnostic context (the error, `package.json`, the failing file) and run a **gated Claude Code run** (snapshot → Keep/Revert) that applies a minimal fix. Claude is instructed to **never invent secrets** — for env/DB/credential issues it identifies the required variables and surfaces them for the user to fill.
- Respects the spec-first gate: file-mutating fixes are snapshotted and revertable; nothing changes silently.

## Capabilities

### New Capabilities
- `run-doctor`: the Run view's failure-detection + guided-fix control — runtime error capture, deterministic quick-fixes, and the one-click gated "Fix with Claude" run with snapshot/revert.

### Modified Capabilities
<!-- No spec-level requirement changes to existing capabilities; run-doctor reuses the
     dev-server, env-file helper, and gated-run (useAgentRun) paths as-is. -->

## Impact

- **`packages/core`:** extend the inspector-bridge protocol with a `runtimeError` event; the guest preload adds `error`/`unhandledrejection` listeners; add a placeholder-env check to the env-file helper.
- **`packages/ui`:** `useInspectorBridge` surfaces the latest runtime error; a `RunDoctor` panel in `RunApp` that triages (Tier 1) and runs the gated "Fix with Claude" (Tier 2) via `useAgentRun` + snapshot/restore.
- **Reused, unchanged:** `dev-server.ts` error state, `env-files.ts`, `useAgentRun` + `snapshot*`/`restoreFiles`.
- **Invariants upheld:** Claude Code is the engine (VortSpec never re-implements the fix); spec-first gate (snapshot + Keep/Revert); the user's own Claude; never fabricates credentials.
