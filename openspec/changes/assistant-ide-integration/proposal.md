## Why

The IDE's assistant sidebar drives the user's local Claude Code (`claude -p` stream-json), but it's a thin chat: it can't see the file/selection the user is looking at, it can't act on the IDE (open or clone a folder from chat), and it surfaces none of the session's real state (which model, which skills/agents/MCP servers are available). The official Claude Code VS Code extension does all of this by running a local **IDE MCP server** that `claude` connects to. We want the same parity in VortSpec's assistant.

Research confirmed the mechanism is replicable by a non-VS-Code app: the editor writes a lockfile to `~/.claude/ide/<port>.lock` and runs a `127.0.0.1` WebSocket MCP server; `claude --ide` auto-connects (the flag and lockfile format are verified against the installed CLI 2.1.204). The `system/init` stream-json event already carries `model`, `skills` (60), `agents` (8), `tools` (38), `mcp_servers` (with `status`), `slash_commands`, `plugins`, and `permissionMode` — everything needed for the status UI (verified empirically).

## What Changes

- **IDE MCP bridge.** VortSpec's IDE runs a local WebSocket MCP server (lockfile in `~/.claude/ide/`, `127.0.0.1` + auth token, MCP 2024-11-05), and the AgentAdapter spawns `claude -p --ide …` so Claude connects. This exposes editor tools to Claude and lets Claude push/pull IDE context.
- **Active-file + selection context.** Like the extension, the assistant is grounded in the currently-open file and the user's text selection — surfaced to Claude via the bridge (selection/open-editors) and a visible context chip (`⧉ N lines from <file>`).
- **IDE-control tools.** The bridge exposes tools Claude can call to act on the IDE: `openFile`, `openDiff`, `getCurrentSelection`, `getOpenEditors`, `getWorkspaceFolders`, `getDiagnostics`, plus VortSpec-specific **`openFolder`**, **`cloneRepo`**, and **`switchProject`** — so the user can ask the assistant to open/clone a folder or switch projects from chat.
- **Session status UI.** The assistant sidebar surfaces the `init` event's **model**, **skills**, **agents/subagents**, **MCP servers with connection status**, **tools**, **plugins**, and **permission mode** — an expandable "session" panel, plus the model shown inline.
- The AgentAdapter gains an opt-in `ide` flag (the IDE sets it; the cockpit does not, so its runs are unchanged). No `--bare`, no stored keys — the user's own login, as always.

## Capabilities

### New Capabilities
- `ide-mcp-bridge`: the local WebSocket MCP server + lockfile that `claude --ide` connects to, exposing editor tools (read selection/editors/diagnostics; open file/diff) and VortSpec IDE-control tools (open/clone folder, switch project) to Claude.
- `assistant-active-context`: grounding the assistant in the open file + text selection (pushed via the bridge and shown as a context chip), matching the extension's file/selection awareness.
- `assistant-session-status`: surfacing the model, skills, agents, MCP servers (+status), tools, plugins, and permission mode from the `system/init` event in the assistant UI.
<!-- Voice dictation deferred out of this change. -->

### Modified Capabilities
<!-- The assistant/agent-adapter behavior lives in the unarchived vortspec-ide / pivot changes, so the additions are captured as new capabilities above rather than delta specs. -->

## Impact

- **@vortspec/core**: `AgentAdapter` gains an opt-in `--ide` arg; a new **IDE MCP server** module (WS + JSON-RPC 2.0 + MCP, lockfile lifecycle in `~/.claude/ide/`) + IPC to start/stop it and to register the tool handlers; extend the `system-init` parse (events.ts) + `run-events` schema to carry `model`, `skills`, `agents`, `mcpServers` w/ status, `plugins`, `permissionMode`, `slashCommands`.
- **apps/ide**: run the bridge for the open workspace; feed it the active file/selection from the layout/editor state; implement the IDE-control tool actions (openFile→editor, openFolder/cloneRepo/switchProject→workspace); a "session" status panel + model chip in `AssistantDock`.
- **@vortspec/ui**: `AssistantDock` gains the status panel + richer context chip (behind props, so the cockpit is unaffected).
- **Security**: bind to `127.0.0.1` only, per-connection auth token, lockfile mode 0600; IDE-control tools that change state (open/clone/switch) are gated/confirmed, never silent.
- **Tests**: unit tests for the MCP server (handshake/auth/tool dispatch) + init parsing; CT for the status panel, context chip, and IDE-control confirmations; keep the cockpit + all suites green.
