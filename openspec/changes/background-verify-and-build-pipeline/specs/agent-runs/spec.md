# agent-runs

## ADDED Requirements

### Requirement: Render harness provisioning for verify
Before an autonomous verify run, the app SHALL ensure a render harness (Storybook or dev
server) is running for the project and pass its live URL into the run.

#### Scenario: Storybook missing
- **WHEN** the project has no Storybook configuration
- **THEN** the app runs the `/storybook` skill once to create it before starting the
  server, and this bootstrap is idempotent (skipped if already present)

#### Scenario: Harness unavailable
- **WHEN** the harness cannot be started
- **THEN** verify still runs the code-level audit, the prompt states the live surface is
  unavailable, and the agent logs any browser-only check as "pending" rather than asking
  the user to start a server

### Requirement: Autonomous verify prompt contract
The verify prompt SHALL instruct Claude Code to run visual-verify and adversarial-review
end-to-end without user interaction, using the provided harness URL and the Figma MCP,
fixing discrepancies inline and writing the report files plus a final one-line verdict.

#### Scenario: Verdict line
- **WHEN** a verify run finishes
- **THEN** its final line is `VERIFY: PASS` or `VERIFY: ISSUES (n)`, and the report files
  exist under `specs/<component>/`
