## Why

Figma is central to how VortSpec works — design-system import, screen-to-Figma, token sync, and the Run-canvas comparisons all read design context through the **Figma MCP** in the user's Claude Code. Yet today the Figma MCP is treated as an afterthought:

- In `environment-check`, a missing Figma MCP is reported as `unknown` — "only needed for Figma design sources" — informational, never surfaced as a real gap.
- In `first-run-automation`, the step only *offers* to install and the actual install command (`claude mcp add --transport http figma https://mcp.figma.com/mcp`) is merely **shown to the user to copy**, not run.

So a fresh machine reaches "ready" with **no Figma MCP**, and the core Figma features silently fail. This change **moves the Figma MCP into the prerequisite flow as a first-class, auto-configured step**: detect it, install it automatically when absent, guide the one interactive OAuth, and verify — the same detect → install → re-verify treatment the other prerequisites get.

## What Changes

- **`environment-check`:** render a **Figma MCP** row (present / needs-auth / missing) with a fix action, alongside Node / git / Claude Code / login — no longer buried as informational. It stays off the base tool-`ready` gate (Node/git/Claude-install), but is prominent and, for Figma design-source projects, treated as required.
- **`first-run-automation`:** the Figma MCP step **actually installs** — VortSpec runs `claude mcp add --transport http figma https://mcp.figma.com/mcp` for the user (idempotent; ignore "already added"), then, because MCP OAuth is interactive, opens `claude` in the embedded terminal and guides `/mcp → Authenticate` (browser sign-in), polling `claude mcp list` until the server reports connected. Skipped when already present + authenticated. Idempotent and resumable like the terminal/login steps.
- **Clarify the two Figma paths:** the remote **Figma MCP** (read design context into Claude — this change) is distinct from **figma-cli** (VortSpec's local writer, the existing "Connect Figma" step). Both are set up in first-run; this change makes the MCP a real step rather than a shown command.

## Capabilities

### Modified Capabilities
- `environment-check`: adds the Figma MCP as a rendered check row with a fix action (present / needs-authentication / missing), while keeping the base `ready` gate on the installable tools only.
- `first-run-automation`: upgrades the Figma MCP step from "offer + show command" to auto-running the documented `claude mcp add`, then guiding the interactive OAuth in the terminal and verifying — idempotent and resumable.

## Impact

- **`packages/core`:** `env-manager` — add a fix action that **runs** `claude mcp add …` (not just `openExternal`); keep detection via `claude mcp list` but classify a missing MCP as an actionable state, not merely `unknown`. New/updated IPC (`figma:mcpAdd`) invoked from the fix + first-run step. Reuse `figma-health.checkFigmaHealth` for the optional deep verify (usage-metered, on explicit verify only).
- **`packages/ui`:** `EnvironmentCheck.tsx` — the Figma MCP row + "Add Figma MCP" fix. `FirstRunSetup.tsx` — the Figma MCP step runs the add, then drives the interactive `/mcp → Authenticate` in the PTY and polls to green (mirrors the Claude login step's PTY + poll pattern).
- **Reused, unchanged:** the embedded PTY, `execFileSafe`, `claude mcp list` detection, the idempotent-on-mount + resume machinery, `fix-path` PATH repair.
- **Invariants upheld:** the user's own Claude Code and browser OAuth — VortSpec never handles Figma/Claude credentials; no account, no stored keys; OAuth is interactive in the PTY (headless `claude -p` has no `/mcp`). `claude mcp add` writes only into the user's own Claude MCP config, which they can inspect and revoke.
