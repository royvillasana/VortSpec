## MODIFIED Requirements

### Requirement: Guided first-run automation

After the desktop app is installed and launched for the first time, VortSpec SHALL offer a single **Accept** that runs a guided setup automating getting the user to a ready state end to end: providing Node (bundled), installing the Claude Code CLI (managed prefix) and git (platform installer), opening a terminal session, authenticating Claude Code, and ensuring the Figma MCP is available. The sequence SHALL run each step automatically — install, validate, and advance — pausing only for the **irreducible interactive approvals** (the OS Command Line Tools dialog, the Claude browser sign-in, and the Figma MCP browser authorization), which SHALL be shown as an explicit "waiting for you" state that the flow leaves automatically the moment the approval completes. Each step SHALL report success or a clear next action, the flow SHALL require no elevated privileges, and it SHALL be resumable if interrupted.

#### Scenario: One-click first-run setup

- **WHEN** the user launches VortSpec for the first time (or reopens setup) and accepts
- **THEN** VortSpec SHALL run, in order and automatically, the base-tool installs (Node bundled, Claude CLI, git), then the terminal, Claude authentication, and Figma MCP steps, advancing each on its own and showing per-step status

#### Scenario: Only the irreducible approvals require the user

- **WHEN** the guided setup runs on a fresh machine
- **THEN** the only actions required of the user SHALL be approving the OS Command Line Tools installer, signing in to Claude in the browser, and authorizing the Figma MCP in the browser — every other step SHALL run and validate without user input, and no administrator password SHALL be requested by VortSpec

#### Scenario: Setup resumes after interruption

- **WHEN** first-run setup is closed partway through and reopened
- **THEN** VortSpec SHALL re-detect which steps are already complete (tools installed, login present, MCP installed) and resume from the first incomplete step
