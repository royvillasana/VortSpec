# Launch Gate: Claude Code headless interface (for the AgentAdapter)

**Task:** `pivot-to-desktop-cockpit` 0.2
**Date verified:** 2026-07-05 against <https://code.claude.com/docs/en/headless>
**Status:** ✅ Verified. Flags/events below are the contract the `AgentAdapter` encapsulates. Re-verify at implementation time (the CLI evolves).

> Note: the official docs frame headless `claude -p` as **"the Agent SDK via the CLI."** VortSpec uses the **CLI form** (`claude -p`), not the Python/TS SDK packages — this matters for the policy gate (see `launch-gate-anthropic-policy.md`).

## Invocation

```bash
claude -p "<prompt>" --output-format stream-json --verbose --include-partial-messages
```

- `-p` / `--print` — non-interactive; runs the prompt start-to-finish. Reads stdin (pipe data in; 10MB cap as of v2.1.128).
- `--output-format` — `text` (default) | `json` | `stream-json`.
  - `json`: single structured object — `result`, `session_id`, usage, `total_cost_usd`, per-model cost breakdown.
  - `stream-json`: newline-delimited JSON, one event per line, emitted as it happens. **This is what the run view consumes.**
  - `--json-schema '<schema>'` (with `--output-format json`): constrained output in a `structured_output` field. Useful for parsing intake/artifact results deterministically.
- `--verbose --include-partial-messages` — required to receive token deltas in `stream-json`.
- `--allowedTools "Read,Edit,Bash"` — auto-approve tools (permission-rule syntax; `Bash(git diff *)` prefix matching).
- `--permission-mode` — `acceptEdits` (auto file writes + common fs cmds) | `dontAsk` (deny anything not in allow rules / read-only set; good for locked-down runs).
- `--append-system-prompt "…"` / `--system-prompt "…"` — inject SDD-DE step framing.
- `--continue` (most recent conversation) / `--resume "<session_id>"` — multi-step flows. **Session lookup is scoped to the working directory** — always spawn in the project folder. Capture `session_id` from the first `--output-format json` call.
- `--mcp-config <file-or-json>` — supply the user's Figma MCP config.
- **`--bare`** — skips auto-discovery (hooks, skills, plugins, MCP, CLAUDE.md) **and skips OAuth/keychain → requires `ANTHROPIC_API_KEY`.** ⚠️ **VortSpec must NOT use `--bare`** (would need a VortSpec-supplied key, violating "no keys"; also skips the SDD-DE skills/CLAUDE.md we depend on). Non-bare `-p` loads project + `~/.claude` context and uses the user's login.

## stream-json event types (parse into typed run events)

| Event | Shape / key fields | Use in run view |
| --- | --- | --- |
| `system` / `init` | first event; `model`, `tools`, `mcp_servers`, `plugins[]{name,path}`, `plugin_errors[]{plugin,type,message}`, `session_id` | Detect model/tools; **detect missing/failed Figma MCP → fix-it card** (`design-input`) |
| `system` / `plugin_install` | `status` (started/installed/failed/completed), `name`, `error` (only when `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` set) | Toolkit/plugin install progress |
| `system` / `api_retry` | `attempt`, `max_retries`, `retry_delay_ms`, `error_status`, `error` (category), `uuid`, `session_id` | Surface retry/backoff; **`error` categories → fix-it cards** |
| `stream_event` | `event.delta.type == "text_delta"` → `event.delta.text` | Live assistant text |
| assistant / tool_use / tool_result messages | standard message objects | Current task, tool activity, files edited (paths) |
| `result` | final `result`, `session_id`, usage, `total_cost_usd` | Completion + cost/history record (`run-history`) |

### `api_retry` / auth error categories (map to friendly fix-it cards)
`authentication_failed`, `oauth_org_not_allowed`, `billing_error`, `rate_limit`, `overloaded`, `invalid_request`, `model_not_found`, `server_error`, `max_output_tokens`, `unknown`.
→ `authentication_failed` / `oauth_org_not_allowed` should route to the login/env-check flow; `billing_error` / `rate_limit` to a plan/usage message.

## Behaviors that affect the design
- **`/login` is NOT available in `-p` mode** (interactive-only). ⇒ The environment-check login flow **must run in the PTY terminal**, not headless. (Confirms `environment-check` / `agent-runner` PTY-fallback design.)
- **Background tasks** (dev servers) started during `-p` are killed ~5s after the final result. ⇒ **Run the dev preview server as its own managed PTY process** (`dev-preview`), not as a side-effect of a `-p` run. Env knobs: `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`.
- User-invoked **skills/custom commands work in `-p`** (`/skill-name` in the prompt is expanded) ⇒ SDD-DE skills can be triggered headless.
- `/config key=value` can set a setting from a `-p` invocation (v2.1.181+).

## Permissions in headless mode (important)
`claude -p` **cannot show interactive permission prompts**, so any tool not pre-allowed is auto-**denied** — this is why MCP tools (e.g. `mcp__claude_ai_Figma__get_variable_defs`) fail with "you haven't granted it yet" even when the MCP server is enabled. Mechanisms (verified against `/en/cli-reference`):
- `--allowedTools "<rules>"` — allowlist. MCP pattern is `mcp__<server>` (all tools of a server) or `mcp__<server>__<tool>`. Fragile for us: the server name varies per user (`claude_ai_Figma`, `figma-console`, …).
- `--permission-mode` — `default|acceptEdits|plan|auto|dontAsk|bypassPermissions`. `acceptEdits` auto-approves file edits + common fs commands but **not** MCP/network. `dontAsk` denies anything not allowlisted.
- **`--dangerously-skip-permissions`** (= `--permission-mode bypassPermissions`) — skips all prompts; works for any MCP server + Bash. **VortSpec uses this for guided-flow runs** (`AgentRunOptions.bypassPermissions`) because the user explicitly triggers each stage and the run is confined to the project folder. (`--permission-prompt-tool` could later route prompts to an MCP handler for a "guarded" mode.)

## AgentAdapter contract (implication)
The adapter owns: building the arg array (never shell-interpolating user input), spawning non-bare `claude` in the project cwd, parsing each stream-json line into a Zod-validated typed event, mapping `system/init` MCP data + `api_retry` error categories to fix-it signals, capturing `session_id` for `--resume`, and routing `/login` + dev-server to the PTY. Recorded stream-json transcripts are the test fixtures.
