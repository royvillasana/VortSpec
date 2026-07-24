## ADDED Requirements

### Requirement: A bundled Node runtime is present with zero user action

VortSpec SHALL ship a Node runtime inside the app for each supported architecture and expose it on the PATH used by the embedded terminal and every child process VortSpec spawns (`claude`, `npm`, …), via a VortSpec-managed bin directory (e.g. `~/.vortspec/bin`). Node SHALL therefore satisfy the Node prerequisite without the user installing anything, and without requiring Homebrew, a system Node, or elevated privileges.

#### Scenario: Node is available on a machine with no system Node

- **WHEN** first-run starts on a machine with no Node on the system PATH
- **THEN** the bundled runtime SHALL be on VortSpec's managed PATH and the Node check SHALL pass with no user action

#### Scenario: The managed runtime is used for VortSpec's spawns

- **WHEN** VortSpec runs `claude`/`npm` for setup or a run
- **THEN** it SHALL resolve them via the managed PATH (bundled Node + `~/.vortspec/bin`), independent of the user's shell configuration

### Requirement: The Claude CLI installs into a managed prefix without sudo

When the Claude Code CLI is absent, VortSpec SHALL install the **official** `@anthropic-ai/claude-code` package using the bundled Node/npm into the VortSpec-managed prefix (`npm install -g … --prefix ~/.vortspec`), so `claude` lands in `~/.vortspec/bin`. The install SHALL require no administrator password and SHALL NOT modify system directories. The installed binary SHALL be run with the user's own login and never with `--bare`.

#### Scenario: Claude CLI installed without a password prompt

- **WHEN** the Claude CLI is missing and the user accepts setup
- **THEN** VortSpec SHALL install it into `~/.vortspec/bin` using the bundled npm, with no sudo prompt, and the Claude-install check SHALL then pass

#### Scenario: The managed CLI runs with the user's login

- **WHEN** VortSpec invokes the managed `claude`
- **THEN** it SHALL use the user's own Claude login (never `--bare`, never a VortSpec-supplied key)

### Requirement: git installs via the platform's supported mechanism

When git is absent, VortSpec SHALL trigger the platform's supported install — on macOS, `xcode-select --install` (Apple's Command Line Tools installer) — and poll `git --version` until git is present, then advance. The only user action SHALL be approving the OS installer dialog.

#### Scenario: git installed via Apple Command Line Tools

- **WHEN** git is missing on macOS and the user accepts setup
- **THEN** VortSpec SHALL run `xcode-select --install`, wait for the user to approve Apple's dialog, and poll until `git --version` succeeds

### Requirement: Installation requires no elevated privileges

The base-tool installation SHALL complete without requesting an administrator/sudo password. Node is bundled; the Claude CLI installs into a user-writable managed prefix; git uses the OS's own privileged installer (which handles its own consent). VortSpec itself SHALL never invoke `sudo`.

#### Scenario: No sudo across the flow

- **WHEN** the base tools install on a fresh machine
- **THEN** VortSpec SHALL not run `sudo` and SHALL not prompt for an administrator password (aside from the OS's own installer dialogs it triggers)

### Requirement: Installs are idempotent and progress-reporting

Each install step SHALL be idempotent — re-running detects what is already present and installs only what is missing — and SHALL report progress (running / waiting-for-approval / done / error) so the guided flow can advance automatically and resume after an interruption.

#### Scenario: Re-running skips what's present

- **WHEN** the install runs again after some tools are already present
- **THEN** the present tools SHALL be skipped and only the missing ones installed

#### Scenario: Progress drives auto-advance

- **WHEN** an install step completes and verifies
- **THEN** the flow SHALL advance to the next step automatically without further user action
