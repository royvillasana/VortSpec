## Context

The assistant sidebar drives the user's local Claude Code via `AgentAdapter`, which spawns `claude -p <prompt> --output-format stream-json --verbose --include-partial-messages` (+ optional `--append-system-prompt`, `--allowedTools`, `--resume`, `--dangerously-skip-permissions`) with `shell: false`. Today the assistant only seeds the open-file path into the prompt; it has no live editor awareness, can't act on the IDE, and surfaces almost none of the session state.

Empirically verified against the installed CLI (2.1.204):
- `claude --ide` — "Automatically connect to IDE on startup if exactly one valid IDE is available." Works alongside `-p`.
- Discovery lockfile `~/.claude/ide/<port>.lock` (mode 0600): `{ pid, workspaceFolders, ideName, transport: "ws", runningInWindows, authToken }`. The port is the filename.
- The `system/init` stream-json event carries: `model` (e.g. `claude-opus-4-8[1m]`), `tools` (38), `mcp_servers` (`[{name, status}]`, status ∈ connected/pending/failed/needs-auth), `slash_commands` (89), `skills` (60), `agents` (8), `plugins` (3), `permissionMode`, `apiKeySource`, `claude_code_version`, `cwd`, `output_style`, `fast_mode_state`, `memory_paths`.

So the whole thing is feasible without the SDK or `--bare`: run the same WebSocket MCP server VS Code runs, pass `--ide`, and parse more of `init`.

## Goals / Non-Goals

**Goals:**
- Parity with the Claude Code extension's editor integration: active-file/selection context + editor tools, via a VortSpec-run IDE MCP server that `claude --ide` connects to.
- IDE-control tools so the assistant can open/clone/switch projects from chat (gated).
- Surface model, skills, agents, MCP servers (+status), tools, plugins, permission mode in the assistant.

**Non-Goals:**
- Re-implementing Claude Code, the SDK, or `--bare`. We still drive the user's own non-bare `claude`.
- Full MCP server generality — we implement exactly the tool set Claude Code's IDE integration expects + our IDE-control tools.
- Jupyter `executeCode` (notebook kernels) — out of scope for v1.
- Voice dictation of any kind — deferred to a later change (the CLI's `/voice` is interactive-only and sends audio off-device; a local/offline transcriber is the eventual path).

## Decisions

### 1. Reproduce the Claude Code IDE MCP server (WS + lockfile), don't invent a protocol
Run a WebSocket server on `127.0.0.1:<port>` speaking JSON-RPC 2.0 / MCP 2024-11-05, and write `~/.claude/ide/<port>.lock` with our token + `ideName: "VortSpec IDE"`. The AgentAdapter adds `--ide` for IDE runs. This is exactly what the extension does, so the *user's own* `claude` connects with no config. Lives in `@vortspec/core/main/ide-bridge` with IPC to (a) start/stop bound to the workspace and (b) register renderer-side handlers for the tools (selection, open-file, openFolder…). **Why not a stdio `--mcp-config` server?** The IDE integration Claude expects (selection/at-mention notifications, `mcp__ide__*`) is the WS+lockfile channel; matching it gives us the extension's UX (the `⧉ selected N lines` behavior) for free and avoids diverging.

### 2. Editor context flows both ways
Claude pulls via tools (`getCurrentSelection`, `getOpenEditors`, `getWorkspaceFolders`, `getDiagnostics`) and the IDE pushes `selection_changed` notifications as focus/selection changes — the renderer already owns `wf.activePath` and can report Monaco's selection. The visible context chip is driven from the same state.

### 3. IDE-control tools are first-class but gated
`openFile`/`openDiff` are safe (reversible view changes). `openFolder`/`cloneRepo`/`switchProject` change app state, so each requires a user confirmation surfaced in the IDE (reusing the existing folder-picker / `gitImport` / recents). This directly answers "ask the assistant to open or clone a folder," without letting a model silently swap the user's workspace.

### 4. Extend init parsing additively
Add `model`, `skills`, `agents`, `mcpServers[].status`, `plugins`, `permissionMode`, `slashCommands` to the `system-init` run-event (Zod) and `events.ts`. Existing fields (tools/mcpServers/mcpErrors) stay; cockpit consumers are untouched. The AssistantDock renders a model chip + an expandable "session" panel from these.

### 5. Cockpit isolation
Everything is opt-in: the cockpit's AgentAdapter calls omit `--ide`; the bridge only runs in the IDE;the AssistantDock additions (status panel, richer chip) are behind props. Desktop CT must stay green.

## Risks / Trade-offs

- **[Headless `--ide` behavior may differ from interactive]** → Verified the flag exists and the lockfile/format are real; but confirm end-to-end that `claude -p --ide` actually connects to *our* lockfile (test with a real run) before building the tool surface. Phase 1 gates on this.
- **[Undocumented MCP tool schemas]** (`mcp__ide__*`, selection/at-mention notification shapes) → Capture a real VS Code ↔ CLI session (or the extension source) to pin exact method names/params; implement to the observed contract, add a compatibility test with recorded fixtures.
- **[init field drift across CLI versions]** → Parse defensively (all new fields optional); fall back gracefully; the run-event schema tolerates missing keys.
- **[Security]** → loopback-only bind, per-session token, 0600 lockfile, workspace-root path guard on every file tool, user-gated state changes. No keys stored.
- **[Model swaps workspace unexpectedly]** → all workspace-changing tools are user-confirmed.
- **[Big surface]** → phase it (below) so each phase ships value and stays green.

## Migration Plan

1. **Phase A — Session status (no bridge).** Extend init parsing + run-event; add the model chip + session panel to AssistantDock. Ships immediately, low risk.
2. **Phase B — Bridge handshake.** Implement the WS+lockfile server + `--ide`; prove a real `claude -p --ide` connects and lists our server in `init.mcp_servers`. Gate before B+.
3. **Phase C — Editor context + tools.** getCurrentSelection/getOpenEditors/getWorkspaceFolders/getDiagnostics/openFile/openDiff + selection push + the context chip.
4. **Phase D — IDE-control tools.** openFolder/cloneRepo/switchProject with confirmations.
- **Rollback:** each phase is additive and opt-in; revert the AssistantDock/adapter opt-in to disable.

## Open Questions

- Exact `mcp__ide__*` method names + selection/at-mention notification schemas — pin from a captured session or the extension source.
- Does `claude -p --ide` connect when multiple lockfiles exist (the flag says "exactly one valid IDE")? We may need to ensure ours is the sole/selected one, or use `--mcp-config` targeting for determinism.
- Should the session panel also allow switching the model (`--model`) per session, or just display it?
