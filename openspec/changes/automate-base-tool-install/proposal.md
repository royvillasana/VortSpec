## Why

First-run is not yet seamless. `environment-check` detects Node, git, and the Claude Code CLI, but when any is missing the only "fix" is `shell.openExternal(install-url)` — the user is dropped onto a download page and left to install by hand. On a truly fresh machine that's real friction at the worst moment (first launch), and it's exactly the opposite of the product promise: *the user should just Accept, and VortSpec sets everything up*, pausing only for the handful of approvals that Apple and OAuth genuinely require.

This change makes the base tools **auto-install**. VortSpec **bundles a Node runtime**, installs the Claude CLI into a VortSpec-managed location (no Homebrew, no system Node, no sudo), triggers git's Apple Command Line Tools installer, and runs the whole sequence automatically — detect → install → validate → advance — as one guided flow. The user's only actions are the irreducible three: the Apple CLT **Install** click, the Claude **browser sign-in**, and the Figma MCP **browser Authenticate** (the last already shipped in `figma-mcp-prerequisite`).

## What Changes

- **Bundle a portable Node runtime with the app** (per-arch), and put it — plus a VortSpec-managed `~/.vortspec/bin` — on the PATH used by the embedded terminal and every `claude`/`npm` VortSpec spawns. Node is therefore "installed" with zero user action.
- **Install the Claude CLI into the managed prefix** using the bundled Node/npm (`npm install -g @anthropic-ai/claude-code` with `--prefix ~/.vortspec`), so `claude` lands in `~/.vortspec/bin` — no sudo, no system pollution, version-controllable. It remains the **official** CLI, run with the user's own login (never `--bare`).
- **git via Apple Command Line Tools:** when git is absent, run `xcode-select --install` (Apple's one-click installer) and poll `git --version` until present.
- **Turn the env-check fixes into installs:** the Node / git / Claude-CLI rows' fix actions **run the install** instead of opening a docs link.
- **Seamless orchestration in first-run:** one **"Set up VortSpec"** (Accept) runs the sequence automatically — each step installs, validates, and advances on its own; interactive-only moments (Apple CLT dialog, Claude login, Figma auth) show a clear "waiting for you" state and the flow resumes the instant they complete. Idempotent and resumable; anything already present is skipped.
- **macOS first** (per the PRD); Windows/Linux install mechanisms are a later tier.

## Capabilities

### New Capabilities
- `base-tool-install`: VortSpec's bundled Node runtime + managed install of the Claude CLI and git on a fresh machine, on a VortSpec-managed PATH, with no Homebrew/sudo — the engine behind the seamless first-run.

### Modified Capabilities
- `environment-check`: the Node / git / Claude-CLI rows' fix actions **run an install** (not an install-link), and report install progress; the base `ready` gate is unchanged.
- `first-run-automation`: a single-Accept guided sequence that auto-installs the base tools, then login + Figma MCP, advancing automatically and pausing only for the irreducible approvals.

## Impact

- **Build (electron-builder):** bundle a Node runtime per target arch as an extra resource; a post-extract step exposes it under a stable path. App size grows ~30–50 MB/arch.
- **`packages/core`:** a `main/environment/runtime-manager.ts` (locate the bundled Node, materialize `~/.vortspec/bin`, prepend it to spawn + terminal PATH — extends `fix-path.ts`); a `base-install.ts` (git via `xcode-select`, Claude CLI via bundled `npm --prefix`, each idempotent + progress-reporting); env-manager fix actions become install actions; new IPC (`env:installNode`? no — Node is bundled; `env:installGit`, `env:installClaude`).
- **`packages/ui`:** `FirstRunSetup` becomes the seamless installer — one Accept, per-step auto-run with live progress, "waiting for your approval" states for the 3 interactive moments, auto-advance; `EnvironmentCheck` fixes run installs.
- **Reused, unchanged:** the embedded PTY, `execFileSafe`, the detect→install→verify + idempotent-on-mount machinery, the Figma-MCP step (`figma-mcp-prerequisite`).
- **Invariants upheld:** the user's own Claude Code (the bundled binary is the official CLI run with the user's login, never `--bare`); no stored credentials; no VortSpec account; no sudo; the 3 approvals (Apple CLT, Claude login, Figma auth) are honestly surfaced, not hidden.
- **Depends on / composes with:** `figma-mcp-prerequisite` (the Figma MCP step) — this change adds the base-tool steps ahead of it in the same flow.
- **Open policy nuance:** the Anthropic launch-gate concluded "invoke the **user's officially installed** `claude`." Installing the official CLI ourselves into a managed prefix (still run with the user's login) must be confirmed acceptable under that gate before public ship — flagged in design.
