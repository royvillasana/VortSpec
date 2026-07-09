# Tasks — Assistant IDE integration (Claude Code parity)

Phased so each phase ships value and stays green (`pnpm build && pnpm test && pnpm lint`). Cockpit stays unchanged (everything opt-in). Drive the user's own non-bare `claude`; never `--bare`, never store keys.

## 1. Phase A — Session status from the init event

- [x] 1.1 Extend the `system-init` run-event (Zod in `run-events`) + `events.ts` parser to carry `model`, `skills`, `agents`, `mcpServers[].status`, `plugins`, `permissionMode`, `slashCommands` — all optional/defensive; existing consumers unaffected.
- [x] 1.2 Unit-test the parser against a recorded real init fixture (model/skills/agents/mcp status/plugins present) and a minimal legacy init (missing fields).
- [x] 1.3 `AssistantDock`: show the active **model** inline in the header; add an expandable **Session** panel listing skills, agents, MCP servers (with status pills), tools, plugins, permission mode. Behind a prop so the cockpit opts out.
- [x] 1.4 CT: the session panel renders model/skills/agents and shows an MCP server's failed/needs-auth status distinctly.
- [x] 1.5 Gate green.

## 2. Phase B — IDE MCP bridge feasibility spike (NEGATIVE RESULT)

- [x] 2.1 Built a standalone raw-WebSocket server + lockfile writer to test the handshake without adding a `ws` dependency prematurely.
- [x] 2.2 Spawned a real `claude -p --ide` against our lockfile (three configs: alongside VS Code, sole valid IDE, and with `CLAUDE_CODE_SSE_PORT`/`ENABLE_IDE_INTEGRATION`).
- [x] 2.3 **Finding: headless `claude -p --ide` never connects** — no upgrade attempt, no `ide` server in `init.mcp_servers`. The WS/lockfile IDE integration is interactive-only. → **Abandon the bridge; pivot** (design Decisions 1a/1b). What loads headless: `--mcp-config` MCP servers (confirmed in `init`).
- [x] 2.4 Spike cleaned up (no `ws` dep added, no lockfiles leaked); VS Code lockfiles restored.
- [x] 2.5 Finding recorded in design.md.

## 3. Phase B′ — Active-file / selection context via prompt injection (read side)

- [x] 3.1 `CodeEditor` reports the live selection (`onDidChangeCursorSelection` → `{startLine,endLine,text}`, null when empty); threaded through `EditorGroup`/`EditorArea`.
- [x] 3.2 App holds the selection (reset on file change), builds a compact per-turn **live context** (`buildLiveContext`: open file + selected range + capped selected text).
- [x] 3.3 `AssistantDock` gains `liveContext`, prepended to **every** message (first + follow-ups); the user's own text is what shows in the bubble (grounding hidden). Context chip shows `⧉ N lines` when a selection exists.
- [x] 3.4 CT: selecting lines shows the chip; the grounded prompt is sent without echoing the context into the bubble.
- [x] 3.5 Gate green. (Live-IDE check of selection answers is part of the user's end-to-end review.)

## 4. Phase C′ — IDE-control tools via a VortSpec stdio MCP server (`--mcp-config`)

- [x] 4.1 `@vortspec/core/main/ide-mcp`: `server.mjs` (generic stdio↔bridge forwarder, Node built-ins only, shipped via `?raw`), `protocol.ts` (catalog + wire types), `bridge.ts` (`IdeMcpBridge`: unix socket + 256-bit token + 0600 temp files, dispatch to a host), `host.ts` (reads from a renderer-mirrored cache; actions pushed to the renderer). Adapter gains `--mcp-config`. Tools: `open_folder`/`clone_repo`/`switch_project` (gated), `open_file`, `get_selection`/`get_open_editors`/`get_workspace_folders`.
- [x] 4.2 IPC: `ide:mcpConfigPath` (starts the bridge, returns the config path), `ide:reportState` (renderer → cache), `ide:action` (main → renderer push), `ide:resolveAction` (renderer → main). `useIdeMcp` reports editor state, runs `open_file` immediately, gates the rest behind `IdeActionDialog`, and performs via `pickFolder`/`refreshProject`/`gitImport`/recents.
- [x] 4.3 CT: a gated tool call surfaces a confirmation; approving replies ok; declining leaves the workspace unchanged and replies "declined"; `open_file` runs with no confirmation.
- [x] 4.4 Gate green. Verified end-to-end with **real Claude**: `--mcp-config` → server → bridge → host round-trips (`vortspec-ide: connected`, `mcp__vortspec-ide__get_workspace_folders` called, host marker returned). Live clone-and-open is part of the user's end-to-end review.

## 5. Verification & docs

- [x] 5.1 Full gate green across packages; cockpit (desktop CT) unaffected; no keys stored; local unix-socket + token + gated state changes verified.
- [x] 5.2 Launch-gate policy doc notes the IDE integration (local stdio MCP via `--mcp-config`, non-bare, user-confirmed actions).
- [ ] 5.3 End-to-end in the running IDE (user's review): model/skills/status visible, assistant sees the selection, opens/clones a folder on request (gated).
