## 1. Runtime error capture

- [x] 1.1 Add a `runtimeError` event ({message, source, line, stack}) to the inspector-bridge protocol.
- [x] 1.2 Guest preload: `window` `error` + `unhandledrejection` listeners that emit `runtimeError`.
- [x] 1.3 `useInspectorBridge` surfaces the latest `runtimeError` (cleared on reload/selection of a new app).

## 2. Deterministic triage

- [x] 2.1 Extend the env-file helper to detect placeholder (`<...>`) or blank required vars in `.env`.
- [x] 2.2 Run Doctor Tier 1: reuse missing-`.env`/install helpers and show the placeholder warning when applicable.

## 3. Fix with Claude (gated)

- [x] 3.1 `RunDoctor` panel in `RunApp`: shows on dev-server error or runtime error, with the captured error.
- [x] 3.2 "Fix with Claude" → snapshot + gated `useAgentRun` with a diagnostic prompt (error + package.json + failing file); no-fabricated-secrets instruction.
- [x] 3.3 Keep / Revert on completion; reload the preview after Keep.

## 4. Tests

- [x] 4.1 Unit: placeholder-env detection; the diagnostic prompt builder (includes the error, forbids inventing secrets).
- [x] 4.2 CT: the Run Doctor shows on a dev-server error and exposes "Fix with Claude"; no write occurs before the click.
