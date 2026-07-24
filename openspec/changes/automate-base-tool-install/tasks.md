## 1. Bundle the Node runtime

- [ ] 1.1 Add a Node LTS (≥ `MIN_NODE_MAJOR`) tarball per target arch (arm64, x64) as an electron-builder extra resource; wire it into `apps/ide` (and `apps/desktop`) build config.
- [ ] 1.2 `runtime-manager.ts`: locate the bundled runtime (asar-unpacked aware), materialize `~/.vortspec/bin` (shims to bundled `node`/`npm`), idempotent.
- [ ] 1.3 Extend `fix-path.ts` to prepend `~/.vortspec/bin` to the PATH for every main-process spawn and the embedded PTY; verify `execFileSafe("node"|"npm"|"claude")` resolves the managed copies.

## 2. Base-tool installers (core)

- [ ] 2.1 `base-install.installClaude()`: `npm install -g @anthropic-ai/claude-code --prefix ~/.vortspec` via the bundled npm (no sudo); idempotent ("already installed" ok); progress events; re-verify `claude --version`.
- [ ] 2.2 `base-install.installGit()` (macOS): `xcode-select --install`; poll `git --version`; treat "already installed"/"already running" as success.
- [ ] 2.3 env-manager: Node check passes off the bundled runtime; git/Claude-CLI fix actions become install actions (new `FixAction` kinds `git-install`, `claude-install-run`), mirroring `figma-add`.
- [ ] 2.4 IPC `env:installGit`, `env:installClaude` (+ preload + api), returning the re-verified `EnvCheck`; progress via events.

## 3. Seamless first-run orchestration (UI)

- [ ] 3.1 `FirstRunSetup`: one **Accept** that runs the full sequence automatically — base tools (Node bundled → git → Claude CLI) → login → Figma MCP — auto-advancing on verify.
- [ ] 3.2 Per-step live status: running / **waiting for your approval** (Apple CLT dialog, Claude login, Figma auth) / done / error; the poller advances the instant each approval completes.
- [ ] 3.3 Idempotent/resumable on mount (re-detect installed tools + login + MCP); already-present steps skipped; Skip still available.
- [ ] 3.4 `EnvironmentCheck`: the Node/git/Claude-CLI fixes run installs (not links) with progress.

## 4. Tests

- [ ] 4.1 Unit: `runtime-manager` PATH prepend + managed-bin resolution (mock fs); `installClaude`/`installGit` build the right args, "already installed" → success, no `sudo` in any command.
- [ ] 4.2 CT: FirstRunSetup runs the sequence with mocked installers → each step auto-advances to done; the 3 approval states render; resume-on-mount skips completed steps. EnvironmentCheck rows run installs.

## 5. Build + docs

- [ ] 5.1 Verify a packaged build includes the bundled Node and a fresh-machine install completes with no sudo (manual, per-arch).
- [ ] 5.2 Update `docs/` (PRD/onboarding) with the bundled-runtime strategy and the 3 irreducible approvals; note the launch-gate open question.

## 6. Launch-gate (blocking public ship, not build)

- [ ] 6.1 Confirm with the Anthropic policy review that installing the official Claude CLI ourselves (managed prefix, user's own login) is acceptable, or adjust to a user-run install.
