## Why

The IDE's assistant sidebar drives the user's local Claude Code (`claude -p` stream-json), but it's a thin chat: it can't see the file/selection the user is looking at, it can't act on the IDE (open or clone a folder from chat), and it surfaces none of the session's real state (which model, which skills/agents/MCP servers are available). The official Claude Code VS Code extension does all of this by running a local **IDE MCP server** that `claude` connects to. We want the same parity in VortSpec's assistant.

Research confirmed the `system/init` stream-json event already carries `model`, `skills` (60), `agents` (8), `tools` (38), `mcp_servers` (with `status`), `slash_commands`, `plugins`, and `permissionMode` — everything needed for the status UI (verified empirically).

**Key pivot (verified during implementation):** the extension's `claude --ide` WebSocket/lockfile bridge is **interactive-only** — a real-run spike proved headless `claude -p --ide` never connects (three configs tested). So the delivered design reaches parity through **headless-supported** mechanisms instead: (a) **prompt injection** for editor context, and (b) a **local stdio MCP server via `--mcp-config`** (which does load headless) for IDE-control tools. The scope also grew, in follow-up work, to the extension's full in-input feature surface (slash commands), rich chat rendering (shadcn/ai), a file/folder/selection context system, and VS Code-style Explorer file operations.

## What Changes

- **Session status UI.** The assistant surfaces the `init` event's **model**, **skills**, **agents**, **MCP servers with status**, **tools**, **plugins**, and **permission mode** — an expandable "session" panel + the model shown inline.
- **Active-file + selection context (prompt injection).** The assistant is grounded in the open file and the user's selection, prepended to every message; a context chip (`⧉ N lines`) surfaces it. The `--ide` WS bridge is NOT used (doesn't work headless).
- **IDE-control via a local stdio MCP server.** A VortSpec MCP server passed with `--mcp-config` exposes `open_file`, `get_selection`/`get_open_editors`/`get_workspace_folders`, and the gated **`open_folder`**/**`clone_repo`**/**`switch_project`** — so the user can ask the assistant to open/clone/switch from chat (each workspace change is user-confirmed).
- **Slash-command palette.** `/` in the composer opens the Claude Code feature surface: local panels for `/mcp`, `/model`, `/context`, `/skills`, `/agents`, `/tools`, `/plugins`, `/status`, plus the session's real slash commands and a Model Selector (switch via `--model`).
- **shadcn/ai chat rendering.** Streaming markdown + highlighted code (Streamdown), Tool cards with expandable/Terminal-style output, Reasoning (thinking), Plan (TodoWrite), Shimmer, Snippet, File Tree.
- **Context references.** `@`-mentions (fuzzy file/folder picker), drag a file/folder from the Explorer into the chat, "Open in Chat" on an editor selection, and a selectable File Tree preview of attached folders — all expanded into the prompt on send.
- **Explorer file operations (VS Code parity).** New file/folder, rename, drag-to-move, delete-to-Trash — workspace-root-guarded.
- The AgentAdapter gains opt-in `--mcp-config` + `--model` args (the IDE sets them; the cockpit does not). No `--bare`, no stored keys — the user's own login.

## Capabilities

### New Capabilities
- `assistant-session-status`: model, skills, agents, MCP servers (+status), tools, plugins, permission mode from `system/init`, in the assistant UI.
- `assistant-active-context`: grounding the assistant in the open file + selection via prompt injection, with a context chip.
- `ide-mcp-bridge`: a **local stdio MCP server** (via `--mcp-config`, unix socket + token) exposing editor-read + gated IDE-control tools to headless Claude (supersedes the interactive WS/lockfile bridge, which is infeasible headless).
- `assistant-slash-commands`: the `/` command palette + model switching.
- `assistant-chat-rendering`: shadcn/ai components (Response/Tool/Terminal/Reasoning/Plan/Shimmer/Model Selector/Snippet/File Tree).
- `assistant-context-references`: `@`-mentions, drag-in, Open-in-Chat, and selectable folder trees.
- `ide-file-operations`: create/rename/move/trash in the Explorer.
<!-- Voice dictation deferred out of this change. -->

## Impact

- **@vortspec/core**: `AgentAdapter` gains `--mcp-config` + `--model`; a new **`ide-mcp`** module (stdio `server.mjs` forwarder shipped via `?raw`, unix-socket `IdeMcpBridge` with token + 0600 temp files, a renderer-backed `host`) + IPC; extended `system-init`/`tool-use`/`tool-result` parse + `thinking-delta`/`plan` events; `searchFiles` + `createFile`/`createDir`/`renamePath`/`trashPath` workspace ops.
- **apps/ide**: report editor state to the bridge; gated confirmations (`IdeActionDialog`); Explorer file-op UI + drag; Open-in-Chat editor overlay; `pendingRef` wiring.
- **@vortspec/ui**: `AssistantDock` gains the slash palette, context attachments, and the shadcn/ai render components (in `components/ai/`), all behind props/opt-in so the cockpit is unaffected.
- **Security**: the MCP server binds a **local unix socket** (not a network port) with a per-run token + 0600 files; state-changing IDE tools are user-confirmed; delete is a reversible OS-Trash; all fs ops are workspace-root-guarded. No keys stored, non-bare.
- **Tests**: unit tests for the MCP bridge (real spawned server round-trip), init/tool/thinking/plan parsing, and fs ops; CT for the status panel, slash palette, render components, context references, gated actions, and Explorer file ops; cockpit + all suites green.
