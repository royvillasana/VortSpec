## 1. Auto-install the Figma MCP (core)

- [ ] 1.1 `env-manager`: add `addFigmaMcp()` that runs `claude mcp add --transport http figma https://mcp.figma.com/mcp` via `execFileSafe` (timeout-bounded), treating "already added/exists" as success; reuse the shared `REMOTE_FIGMA_MCP_CMD` constant.
- [ ] 1.2 IPC `figma:mcpAdd` (+ preload) invoking it; return the post-add `verifyFigmaMcp` state.
- [ ] 1.3 Change the missing-MCP classification from informational `unknown` to an actionable state with an "Add Figma MCP" fix (keep `present`/`needs-auth` states from `claude mcp list`).

## 2. Environment-check row

- [ ] 2.1 `checkEnvironment`: include a **Figma MCP** row (present / needs-auth / missing); keep the base `ready` gate on Node/git/claude-install only.
- [ ] 2.2 `EnvironmentCheck.tsx`: render the row + fix; on-mount usage-free detect (as today); "Add Figma MCP" runs `figma:mcpAdd` then re-verifies.
- [ ] 2.3 Mark the Figma MCP as blocking only when the selected project's `design_source` is Figma.

## 3. First-run step (auto-install + guided OAuth)

- [ ] 3.1 `FirstRunSetup.tsx`: upgrade the Figma MCP step — run `figma:mcpAdd`; if not authenticated, open `claude` in the PTY and guide `/mcp → Authenticate`, polling `claude mcp list` until connected (mirror `signInClaude`'s PTY-write + poll).
- [ ] 3.2 Idempotent/resumable: on mount re-detect (add-done? authed?) and resume from the first incomplete part; skip when present + connected.
- [ ] 3.3 Label clearly: Figma **MCP** (read design context) vs **figma-cli** (local writer) so the two Figma steps aren't confused.

## 4. Tests

- [ ] 4.1 Unit: `addFigmaMcp` builds the correct `claude mcp add` args; "already exists" → success; missing-MCP now maps to an actionable state (not `unknown`).
- [ ] 4.2 CT: EnvironmentCheck renders the Figma MCP row with a fix; FirstRunSetup Figma step shows add → authenticate → verify progression and resumes on re-mount.

## 5. Docs

- [ ] 5.1 Update `docs/figma-connection.md` to note the MCP is now auto-installed in first-run (not just shown), and the MCP-vs-figma-cli distinction.
