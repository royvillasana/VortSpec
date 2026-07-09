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
- [x] 5.3 End-to-end in the running IDE — user confirmed the features work (2026-07-09): model/skills/status visible, selection grounding, Explorer file ops, and the assistant acting on the IDE.

## 6. Phase 6 — Slash-command palette (Claude Code feature surface in the input)

- [x] 6.1 `/` in the composer opens a filterable command menu (↑↓/Enter). Meta commands render local panels from the session's `init` data — `/mcp`, `/model`, `/context`, `/skills`, `/agents`, `/tools`, `/plugins`, `/status`, `/help`, `/clear` — mirroring the CLI's informational commands with no round-trip.
- [x] 6.2 The session's real slash commands (from `init.slashCommands`) are listed too and inserted into the input for the user to add args and send to Claude.
- [x] 6.3 Model switching: picking a model in `/model` (or the composer Model Selector) applies via `--model` (adapter + `AgentRunOptions.model`), on new sessions and follow-ups.
- [x] 6.4 CT: the menu opens and `/model`/`/mcp` render their cards; the Model Selector shows + switches the model. Gate green.

## 7. Phase 7 — shadcn/ai chat rendering

- [x] 7.1 **Response** (Streamdown): assistant replies render as streaming-safe Markdown with Shiki-highlighted code + copy; themed to vs-*. Added deps to `@vortspec/ui` (streamdown, lucide-react, cva, clsx, tailwind-merge) + a `cn` helper + a Tailwind `@source` for streamdown.
- [x] 7.2 **Tool** cards + **ToolSteps**: tool-use/tool-result render as a collapsible "Working · N steps" group (per-tool icon, target, live status); backed by a structured `steps` timeline in `RunModel`.
- [x] 7.3 **Reasoning** + **Terminal**-style output: parser captures extended-thinking (`thinking-delta`), tool input summaries, and tool result text; thinking renders in a collapsible Reasoning block; tool cards expand to show output (Bash → terminal block, command as a copyable **Snippet**).
- [x] 7.4 **Plan**: TodoWrite tool calls map to a `plan` event → a live "Plan · done/total" checklist (pending/in-progress/completed).
- [x] 7.5 **Model Selector**, **Shimmer** (loading), **Snippet**, **File Tree**: the input toolbar, the loading state, copyable code, and a lazy folder tree.
- [x] 7.6 CT: tool cards + statuses, Reasoning, expandable Bash output, Plan checklist, Model Selector switch. Cockpit unaffected (shared dock). Gate green.

## 8. Phase 8 — Context references (files, folders, selections)

- [x] 8.1 **@-mentions**: `@` in the composer opens a fuzzy file/folder picker (new `workspace:searchFiles` IPC; skips build dirs; substring + subsequence match). Picking adds a removable attachment chip.
- [x] 8.2 **Drag-in**: Explorer entries are draggable; dropping one on the composer attaches it.
- [x] 8.3 **Open in Chat**: an editor selection shows a floating button (Monaco overlay) that attaches the selection (path + range + text) and opens the assistant.
- [x] 8.4 **File Tree preview**: a `@folder` chip expands into a lazy, selectable File Tree — select individual files/subfolders (or keep the whole folder) to add as context.
- [x] 8.5 Attachments expand into the prompt on send (files as `@path`, selections with the snippet) and clear after sending. CT: @-mention→chip→prompt, Open-in-Chat ref→chip→prompt, folder preview + tree selection. Gate green.

## 9. Phase 9 — Explorer file operations (VS Code parity)

- [x] 9.1 Core: `createFile` (no-clobber), `createDir`, `renamePath` (rename+move, no overwrite), `trashPath` (OS Trash, reversible) — all workspace-root-guarded. IPC: `workspace:createFile`/`createDir`/`rename`/`trash`.
- [x] 9.2 Explorer UI: New File / New Folder (header + folder context menu), inline rename (double-click / menu), drag-to-move (onto a folder, a file's folder, or root), Delete → Trash; a right-click context menu ties it together.
- [x] 9.3 Robustness: explicit dir refresh after each op (not just the fs watcher), and an inline error banner surfacing failures (incl. the stale-dev-main case).
- [x] 9.4 Tests: fs-op unit tests (create/dup/move/guard); IDE CT for New File/Folder, rename, delete, and a real-DnD drag-to-move. Gate green.
