## Context

The assistant sidebar drives the user's local Claude Code via `AgentAdapter`, which spawns `claude -p <prompt> --output-format stream-json --verbose --include-partial-messages` (+ optional `--append-system-prompt`, `--allowedTools`, `--resume`, `--dangerously-skip-permissions`) with `shell: false`. Today the assistant only seeds the open-file path into the prompt; it has no live editor awareness, can't act on the IDE, and surfaces almost none of the session state.

Empirically verified against the installed CLI (2.1.204):
- `claude --ide` — "Automatically connect to IDE on startup if exactly one valid IDE is available." Works alongside `-p`.
- Discovery lockfile `~/.claude/ide/<port>.lock` (mode 0600): `{ pid, workspaceFolders, ideName, transport: "ws", runningInWindows, authToken }`. The port is the filename.
- The `system/init` stream-json event carries: `model` (e.g. `claude-opus-4-8[1m]`), `tools` (38), `mcp_servers` (`[{name, status}]`, status ∈ connected/pending/failed/needs-auth), `slash_commands` (89), `skills` (60), `agents` (8), `plugins` (3), `permissionMode`, `apiKeySource`, `claude_code_version`, `cwd`, `output_style`, `fast_mode_state`, `memory_paths`.

So the whole thing is feasible without the SDK or `--bare`: run the same WebSocket MCP server VS Code runs, pass `--ide`, and parse more of `init`.

### Feasibility finding (Phase B spike, 2026-07) — the `--ide` bridge does NOT work headless

Verified empirically with a standalone raw-WebSocket server + a real `claude -p` run (CLI 2.1.204): **`claude -p --ide` never opens a connection to our lockfile's port** — no TCP upgrade attempt, and no `ide` entry in `init.mcp_servers`. This held in three configurations:
- `--ide` with our lockfile present alongside the user's VS Code lockfiles;
- `--ide` with our lockfile as the *only* valid IDE (VS Code lockfiles moved aside);
- `--ide` **plus** `CLAUDE_CODE_SSE_PORT=<port>` + `ENABLE_IDE_INTEGRATION=true` in Claude's env.

Conclusion: the `--ide` WebSocket/lockfile integration is an **interactive-mode** feature. Our assistant runs headless (`-p`), so **Decision 1 (reproduce the WS+lockfile IDE server) is not viable** for this product. What *does* load in headless mode is confirmed by the same `init` event: MCP servers passed via `--mcp-config` (figma-console, pencil, etc. all appear). So the pivot is: **deliver the extension's features through headless-supported mechanisms** — prompt-injected context for the read side, and a VortSpec **stdio MCP server via `--mcp-config`** for the tool/control side. See revised Decisions 1a/1b below.

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

### 1. ~~Reproduce the Claude Code IDE MCP server (WS + lockfile)~~ — SUPERSEDED
~~Run a WebSocket server on `127.0.0.1:<port>`…~~ **Disproven by the Phase B spike above: headless `claude -p --ide` does not connect.** Kept here for history; replaced by 1a + 1b.

### 1a. Read side (active file / selection) → prompt injection, no bridge
The assistant already seeds the open-file path. Extend that to a compact, per-turn **live context** — the active file plus, when present, the selected line range and the selected text — prepended to *every* message the dock sends (not just the first), matching how the extension keeps Claude aware of the current selection. The renderer already owns `wf.activePath`; Monaco's `onDidChangeCursorSelection` supplies the range/text. A visible context chip (`⧉ N lines`) surfaces the grounding. This needs no MCP server and works headlessly today. The user's own text is what shows in the chat bubble; the grounding is hidden from the transcript but sent in the prompt.

### 1b. Tool / control side (open/clone/switch, editor reads) → VortSpec stdio MCP server via `--mcp-config`
For tools Claude actively *calls*, ship a small VortSpec MCP server (stdio) and pass it with `--mcp-config` (confirmed to load in headless `-p`). It exposes `open_folder`, `clone_repo`, `switch_project` (state-changing → gated), plus `get_selection`, `get_open_editors`, `get_workspace_folders`, `open_file` (reads/nav). The server process bridges to the Electron main process over a local IPC channel (loopback socket the main process owns, per-session token) to read editor state and to raise the gated confirmations. This replaces the `mcp__ide__*` WS channel with a channel that actually works headless, at the cost of implementing our own tool names (`mcp__vortspec-ide__*`) instead of mirroring `mcp__ide__*`. **Status: built + verified end-to-end with real Claude** (`--mcp-config` → `server.mjs` → unix-socket bridge → host round-trips; `vortspec-ide` shows `connected` in `init.mcp_servers` and Claude calls the tools). Ships in `@vortspec/core/main/ide-mcp` (`server.mjs`, `protocol.ts`, `bridge.ts`, `host.ts`) with the renderer flow in `useIdeMcp` + `IdeActionDialog`.

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

1. **Phase A — Session status (no bridge).** Extend init parsing + run-event; add the model chip + session panel to AssistantDock. ✅ Shipped.
2. **Phase B — Bridge feasibility spike.** ✅ Done, with a *negative* result: headless `--ide` does not connect (see finding). The WS bridge is abandoned; B pivots to the read side.
3. **Phase B′ (was C, read side) — Active-file/selection context via prompt injection.** Live per-turn grounding + context chip. Works headless, no MCP server. ← implemented in this pass.
4. **Phase C′ (was D, control side) — VortSpec stdio MCP server via `--mcp-config`.** `open_folder`/`clone_repo`/`switch_project` (gated) + editor-read tools, bridged to the main process. Larger; pending go-ahead.
- **Rollback:** each phase is additive and opt-in; the read-side grounding is off unless the host passes `liveContext`; the control server is off unless `--mcp-config` is added.

## Open Questions

- Confirm interactively (VS Code ↔ CLI) that the `--ide` bridge is genuinely interactive-only (vs. some undocumented headless handshake flag) — the spike strongly indicates so, but a definitive Anthropic doc reference would close it.
- For the control server: loopback socket vs. named pipe for the MCP-server↔main IPC; how to render the gated confirmation (reuse the folder-picker / `gitImport` / recents flows).
- Should the session panel also allow switching the model (`--model`) per session, or just display it?
