## Context

Run failures fall into two buckets: the dev server never starts (non-zero exit — now captured with a stderr tail), or it starts but the app crashes at runtime in the webview (e.g. `Invalid supabaseUrl`). Today only the first is surfaced in-app; runtime crashes live in the guest console. The gated-edit engine (`useAgentRun` + `snapshotTokenScope`/`snapshotComponent` + `restoreFiles`) and the env-file helper already exist.

## Goals / Non-Goals

**Goals:** capture both failure modes; offer deterministic quick-fixes; make "Fix with Claude" a one-click, revertable, gated run; never fabricate secrets.

**Non-Goals:** not a general in-app terminal debugger; not auto-applying fixes silently (spec-first gate — the user clicks once and Keeps/Reverts); not a replacement for the assistant chat (the Doctor is a focused entry point that uses the same engine).

## Decisions

### D1 — Capture runtime errors via the existing guest bridge
The Run-Canvas guest preload already streams events to the host. Add `window.addEventListener("error"|"unhandledrejection")` in the guest and a `runtimeError` bridge event ({message, source, line, stack}). The hook surfaces the latest one. No new transport.
- *Alternative:* scrape `console-message` — noisier and misses stack/rejection; rejected.

### D2 — Two-tier triage, deterministic first
Cheap known cases (missing `.env`, missing deps, placeholder/blank env vars) are handled without Claude — fast, safe, and they cover the majority (esp. cloned repos). Only the long tail goes to Claude, so we don't spend a run on a one-line `.env` copy.

### D3 — "Fix with Claude" is the gated-run pattern, reused
Snapshot the affected scope, run `useAgentRun` with a focused prompt embedding the error + `package.json` + failing file, then Keep/Revert — identical to the canvas structural-edit flow. The prompt explicitly forbids inventing secrets and asks Claude to enumerate required env vars instead.
- *Rationale:* zero new engine surface; honors "Claude Code is the engine" and the spec-first gate in one move.

## Risks / Trade-offs

- **[Claude edits the wrong thing]** → Snapshot + Keep/Revert makes every fix reversible; the prompt asks for minimal changes.
- **[Runtime error capture misses framework-swallowed errors]** → We capture `error`/`unhandledrejection`; some frameworks catch errors in an error boundary. Fallback: the dev-server path and the user can still open the Doctor manually.
- **[A fix needs a real secret]** → The run is told never to fabricate; it surfaces the needed variables and the deterministic env helper scaffolds the file, keeping values in the user's hands.

## Open Questions

- Should the Doctor auto-open on failure, or show a subtle "Something went wrong — Run Doctor" affordance the user clicks? (Lean: auto-show inline, non-blocking.)
