## Context

`environment-check` detects Node/git/Claude-CLI but "fixes" them with a docs link; first-run then can't proceed automatically. The product goal is a single-Accept, seamless onboarding. The chosen strategy (user decision) is to **bundle a Node runtime** and install everything into a VortSpec-managed location — no Homebrew, no system Node, no sudo. This composes with `figma-mcp-prerequisite` (the Figma MCP step) to complete the fresh-machine story. macOS first.

## Goals / Non-Goals

**Goals**
- One Accept → base tools install → login → Figma MCP → ready, auto-advancing.
- Zero elevated privileges; the only user actions are the 3 irreducible approvals.
- Idempotent + resumable; already-present tools skipped.

**Non-Goals**
- Not Homebrew/system-wide installs; not touching the user's shell profile by default.
- Not Windows/Linux install mechanisms (later tier).
- Not re-implementing the Figma MCP step (done) or login (done).

## Decisions

### D1 — Bundle Node per-arch; expose via a managed PATH

electron-builder ships a Node runtime as an extra resource per target arch (arm64, x64). On first setup, `runtime-manager` materializes `~/.vortspec/bin` (symlinks/shims to the bundled `node`/`npm`) and **prepends** `~/.vortspec/bin` to the PATH used by (a) every `execFileSafe`/spawn from main and (b) the embedded PTY. This extends `fix-path.ts`. Node is thus "installed" with zero user action, independent of the user's shell config. We do **not** edit the user's shell profile by default (offer it as an opt-in later) — VortSpec's own spawns and terminal are enough for the app to work.

### D2 — Claude CLI into a managed prefix, no sudo

With bundled Node/npm: `npm install -g @anthropic-ai/claude-code --prefix ~/.vortspec` puts `claude` in `~/.vortspec/bin` (already on the managed PATH). User-writable prefix → no sudo. It's the official package, run with the user's login (never `--bare`). Version can be pinned. Alternative considered: Claude's curl install script — rejected as less controllable and potentially prompting.

### D3 — git via the OS installer

macOS ships git through Command Line Tools. When absent, `xcode-select --install` pops Apple's installer (the user clicks Install once); we poll `git --version` until it resolves. This is the supported, sudo-free path (Apple's installer handles its own consent). No git bundling.

### D4 — env-check fixes become installs

The Node/git/Claude-CLI `FixAction`s change from `install-link` (openExternal) to install actions (`env:installGit`, `env:installClaude`; Node needs none — bundled). Same pattern as `figma-add` in `figma-mcp-prerequisite`. Rows show running / waiting-for-approval / done / error and re-verify. The base `ready` gate is unchanged.

### D5 — Seamless orchestration in FirstRunSetup

One **Accept** kicks a sequence: for each step, if not already satisfied, run its install, show live progress, auto-verify, auto-advance. Interactive-only moments (Apple CLT dialog, Claude login, Figma auth) render a clear "waiting for you" state and the poller advances the instant they complete. Reuses the existing PTY + poll + idempotent-on-mount machinery; layers the base-tool steps ahead of login + the Figma MCP step. The user can still Skip.

### D6 — No elevated privileges, ever

Node bundled; Claude CLI into a user-writable prefix; git via the OS's own privileged installer. VortSpec never calls `sudo`. This is what makes "just Accept" real (the alternative — Homebrew/system installs — reintroduces password prompts).

## Risks / Trade-offs

- **App size** grows ~30–50 MB/arch for the bundled Node. Acceptable for the friction removed; can ship per-arch DMGs to avoid a universal double-bundle.
- **Bundled Node maintenance** — pin a Node LTS ≥ the app's `MIN_NODE_MAJOR`; refresh on security releases.
- **Managed PATH vs the user's shell** — `claude` in `~/.vortspec/bin` works for VortSpec's spawns/terminal but isn't on the user's global PATH unless we (optionally, opt-in) add it. That's fine: VortSpec's job is to run `claude` itself.
- **A pre-existing system `claude`/Node** — the managed PATH prepends, so VortSpec prefers its managed tools; detection should note when a system copy also exists.
- **Interactive approvals can't be removed** — Apple CLT dialog, two browser sign-ins. The design surfaces them honestly as the only user actions, matching the product framing ("accept and validate").

## Open Questions

- **Launch-gate (existential):** the Anthropic policy review concluded "invoke the **user's officially installed** `claude`." Is installing the official CLI ourselves into a managed prefix (still run with the user's login) acceptable under that gate, or must the user run the install themselves? Confirm before public ship.
- **Bundle format:** ship the official Node tarball per-arch and shim, or a minimal custom build? (Proposed: official Node LTS tarball, extracted at first run.)
- **Profile opt-in:** offer a one-click "add `claude` to my shell PATH" so the user can use it outside VortSpec, or keep the managed PATH internal-only? (Proposed: internal-only by default, opt-in later.)
- **Pin vs. latest** for the Claude CLI install — pin a known-good version, or always latest? (Proposed: latest at install, with a manual re-install to update.)
