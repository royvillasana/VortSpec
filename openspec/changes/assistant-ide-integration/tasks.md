# Tasks — Assistant IDE integration (Claude Code parity)

Phased so each phase ships value and stays green (`pnpm build && pnpm test && pnpm lint`). Cockpit stays unchanged (everything opt-in). Drive the user's own non-bare `claude`; never `--bare`, never store keys.

## 1. Phase A — Session status from the init event

- [ ] 1.1 Extend the `system-init` run-event (Zod in `run-events`) + `events.ts` parser to carry `model`, `skills`, `agents`, `mcpServers[].status`, `plugins`, `permissionMode`, `slashCommands` — all optional/defensive; existing consumers unaffected.
- [ ] 1.2 Unit-test the parser against a recorded real init fixture (model/skills/agents/mcp status/plugins present) and a minimal legacy init (missing fields).
- [ ] 1.3 `AssistantDock`: show the active **model** inline in the header; add an expandable **Session** panel listing skills, agents, MCP servers (with status pills), tools, plugins, permission mode. Behind a prop so the cockpit opts out.
- [ ] 1.4 CT: the session panel renders model/skills/agents and shows an MCP server's failed/needs-auth status distinctly.
- [ ] 1.5 Gate green.

## 2. Phase B — IDE MCP bridge handshake

- [ ] 2.1 `@vortspec/core/main/ide-bridge`: a WebSocket server (127.0.0.1, JSON-RPC 2.0, MCP 2024-11-05 handshake: initialize/tools_list) + lockfile writer/remover in `~/.claude/ide/<port>.lock` (`{pid, workspaceFolders, ideName:"VortSpec IDE", transport:"ws", authToken}`, mode 0600); reject unauthenticated/non-loopback connections.
- [ ] 2.2 IPC to start/stop the bridge bound to the workspace (start on open, swap on change, stop on quit); `AgentAdapter` gains an opt-in `ide` flag that adds `--ide`.
- [ ] 2.3 **Verify end-to-end**: a real `claude -p --ide` (IDE run) connects to our lockfile and our server appears in `init.mcp_servers`. Pin the exact `mcp__ide__*` method names + selection/at-mention notification schemas from a captured session; record fixtures.
- [ ] 2.4 Unit-test the server (handshake, auth accept/reject, tools/list, lockfile lifecycle) headlessly.
- [ ] 2.5 Gate green.

## 3. Phase C — Editor context + read/open tools

- [ ] 3.1 Implement bridge tools: `getCurrentSelection`/`getLatestSelection`, `getOpenEditors`, `getWorkspaceFolders`, `getDiagnostics`, `openFile` (line range), `openDiff` — wired to the IDE (Monaco selection, open tabs, workspace root; all path-guarded).
- [ ] 3.2 Push `selection_changed` notifications from the renderer as the active file/selection changes (from the layout/editor state).
- [ ] 3.3 `AssistantDock` context chip shows the active file and `⧉ <N> lines from <file>` when a selection exists; updates as focus/selection changes.
- [ ] 3.4 CT + unit: selection tool returns path+text+range; openFile opens the tab; the chip reflects file/selection changes.
- [ ] 3.5 Gate green; verify in the running IDE that the assistant can read the selected file.

## 4. Phase D — IDE-control tools (open / clone / switch)

- [ ] 4.1 Bridge tools `openFolder`, `cloneRepo` (reuse `createFolder` + `gitImport`), `switchProject` (recents) — each dispatches a **confirmation** in the IDE; the action runs only on approval, else no-op.
- [ ] 4.2 Wire the confirmations to the workspace open/clone flow (open the result as the workspace).
- [ ] 4.3 CT: an IDE-control tool call surfaces a confirmation; approving opens/switches; declining leaves the workspace unchanged.
- [ ] 4.4 Gate green; verify: ask the assistant to clone a repo → confirm → it opens.

## 5. Verification & docs

- [ ] 5.1 Full gate green across packages; cockpit (desktop CT) unaffected; no keys stored; loopback-only + gated state changes verified.
- [ ] 5.2 Update docs (launch-gate + the two-app site) to note the IDE integration; confirm the Anthropic launch-gate policy still holds (non-bare, user login, IDE MCP is local).
- [ ] 5.3 End-to-end in the running IDE: model/skills/status visible, assistant sees the selection, opens/clones a folder on request (gated).
