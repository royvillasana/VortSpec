## Context

VortSpec's Figma features read design context through the Figma MCP in the user's Claude Code. Today `env-manager.verifyFigmaMcp` detects it via `claude mcp list` but classifies "missing" as informational (`unknown`, "only needed for Figma design sources"), and `FirstRunSetup`/`FigmaHealthCheck` only *show* the install command (`REMOTE_FIGMA_MCP_CMD`). So a fresh machine is "ready" without Figma working. This change makes the Figma MCP a real, auto-configured prerequisite.

Two distinct "Figma" paths exist and must not be conflated: the **remote Figma MCP** (`https://mcp.figma.com/mcp`, read design context into Claude — this change) and **figma-cli** (VortSpec's local writer, the existing `figmaConnect` step). This change is about the MCP.

## Goals / Non-Goals

**Goals**
- Auto-run the documented `claude mcp add` instead of only showing it.
- Guide the one interactive OAuth in the PTY and verify to green.
- Surface the Figma MCP as a real env-check row with a fix.
- Idempotent + resumable; usage-free detection.

**Non-Goals**
- Not gating the base tool-`ready` state on the Figma MCP (only Figma-source projects treat it as blocking).
- Not handling credentials (browser OAuth only).
- Not replacing figma-cli / the deep read-health check.

## Decisions

### D1 — Install = auto-run `claude mcp add`, not a copy-paste

The fix action and first-run step run `claude mcp add --transport http figma https://mcp.figma.com/mcp` via `execFileSafe("claude", …, {shell:false})`, timeout-bounded. It's idempotent — a second add returns "already exists", which we treat as success. This replaces `env-manager`'s current `openExternal`/shown-command behavior with an actual install, mirroring how the Jira detector already self-installs via a command.

### D2 — OAuth is interactive, so it runs in the PTY (like Claude login)

MCP authorization can't be done headlessly (`claude -p` has no `/mcp`). After the add, if the server isn't authenticated, VortSpec opens `claude` in the embedded terminal and instructs `/mcp → select figma → Authenticate` (browser sign-in), then polls `claude mcp list` (usage-free) until the server reports connected — the same PTY-write + poll pattern `FirstRunSetup.signInClaude` already uses for login.

### D3 — Detection stays usage-free; deep health stays on-demand

Presence/auth is read from `claude mcp list` (and/or the user's MCP config) — no metered run, matching the existing env-check discipline. The deeper `figma-health.checkFigmaHealth` (a scoped `claude -p` that actually reads variables/styles) remains an explicit, on-demand verify, not part of the boot scan.

### D4 — Prominent, not core-blocking

The Figma MCP becomes a rendered env-check row with a fix, but the base `ready` gate stays Node/git/Claude-install so non-Figma work isn't blocked. When the selected project's `design_source` is Figma, the MCP is treated as required and surfaced as blocking for that project. This keeps VortSpec usable for non-Figma sources while making Figma-first setup real.

### D5 — `claude mcp add` vs the figma plugin

The documented, minimal path is `claude mcp add … figma …` (per `docs/figma-connection.md`), so it's the default. Installing `figma@claude-plugins-official` is an equivalent alternative that also brings the plugin's skills; if adopted, detection must recognize either. Default to the direct `mcp add`; leave the plugin as an alternative the manifest/flow can switch to.

## Risks / Trade-offs

- **Interactive OAuth can't be fully automated** — the user must complete the browser step; we can only add, guide, and verify. Mitigated by the same PTY+poll UX as login.
- **Writing to the user's MCP config** — `claude mcp add` mutates `~/.claude.json`; it's the user's own config, non-destructive (adds a server), inspectable and revocable. We add only, never remove existing servers.
- **Endpoint drift** — the Figma MCP URL/command could change; keep it in one constant (`REMOTE_FIGMA_MCP_CMD`) already shared by health + UI.
- **Two "Figma" steps** could confuse — the UI must label the MCP (read context) vs figma-cli (local writer) clearly.

## Open Questions

- Should first-run install the Figma MCP unconditionally, or only when the user picks a Figma design source? (Proposed: always offer in first-run; treat as required/blocking only for Figma-source projects.)
- Prefer the direct `claude mcp add` or the `figma@claude-plugins-official` plugin as the canonical install? (Proposed: direct add; plugin optional.)
- Should the env-check row run the usage-free presence check only, or also a light connected/needs-auth probe from `claude mcp list` output (which it already parses)? (Proposed: parse `claude mcp list`; no metered run.)
