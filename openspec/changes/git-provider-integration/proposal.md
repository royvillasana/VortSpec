# Git provider integration (GitHub first)

## Why

VortSpec has no real Git layer. `github` is only a `design_source` enum value plus a
stored `githubRepoUrl` in `project.yaml`; "Publish to GitHub" in the Flow section just
runs the `/commit` skill, and the **"Connect to GitHub" affordance does nothing** — it
was never wired. Users can't connect an account, create a repo, clone/scan a repo as a
design source, manage branches, or push their generated design system back. Design
engineers work *from* and *to* repositories — this is a core missing loop.

The connection must be **bidirectional**: pull a repo in as a source (scan it, build
the design system locally), and push the generated tokens/components/manifest back out
(new branch or a chosen branch, with a PR). And it must eventually cover **GitLab and
Bitbucket**, not just GitHub — but GitHub is the initial approach.

This must honor VortSpec's invariants: **the user's own tools/credentials** (drive the
user's installed `git` and `gh` — store no provider tokens, require no VortSpec
account), **local-first & transparent** (every action maps to a real git command the
user can inspect), **spec-first gates** (generated artifacts are approved before they're
pushed), and **safe process handling** (arg-array spawns confined to the project folder,
never shell-string interpolation of user input).

## What Changes

- **A GitAdapter** in the main process — the single place that knows `git`/`gh` (and
  later `glab`) commands, spawned as argument arrays confined to the project folder,
  mirroring the AgentAdapter/dev-server pattern. Provider-abstracted via a `GitProvider`
  interface so GitLab/Bitbucket slot in later.
- **Fix the connect flow**: "Connect to GitHub" detects the user's `gh` auth state
  (`gh auth status`) and, when signed out, guides them through `gh auth login` (an
  interactive login the app surfaces rather than performs headlessly).
- **Repository creation + push the folder**: `gh repo create` from the app, set the
  remote, and push the project — into a new repo or an existing one.
- **GitHub as a design source (bidirectional, M3)**: in setup, choose a GitHub repo;
  the app clones/pulls it, scans it for design tokens + components, and runs the SDD-DE
  extract-tokens → detect-components → build pipeline to create them in the selected
  framework/language locally — then pushes the generated system back on a new branch or
  a chosen branch, opening a PR.
- **A Source Control panel** in the renderer: repository/branch status, branch
  create/switch/list (never delete), stage/unstage, commit, pull, push, fetch, diff, and
  open-PR — each surfaced as a real, visible command. **VortSpec never deletes a branch**
  — not an existing one and not one it created; it only creates branches and works in
  them (additive, non-destructive to the remote).
- **Non-destructive parallel refactor (M4)**: use the VortSpec-built design system
  (tokens + components + Storybook + DESIGN.md) to re-implement the repo's existing
  screens against the new token-driven components — generated as **duplicated, parallel
  files that never modify or delete the originals**. Old and new coexist; delivered on a
  new branch + PR so the team reviews old-vs-new side-by-side and performs the cutover
  ("disconnect the old, connect the new") on their own timeline. VortSpec never flips the
  switch or removes the old code.
- **Vibe engineering + live localhost runtime (M5)**: after the component set + design
  system + DESIGN.md exist (and are pushed), let the user **compose new screens/features
  conversationally from within the app** using the built components (the SDD-DE Screen
  Creation flow, spec-first gated) and **run a live localhost app environment** — the
  project's own dev server, embedded in VortSpec — so they can run and iterate on what
  they build (distinct from the Storybook component preview).
- **Provider abstraction (M6)**: GitLab via `glab`, Bitbucket via git + its API,
  behind the same `GitProvider` interface and Source Control UI.

## Impact

- New: `main/git/git-adapter.ts` (+ `providers/github.ts`, later `gitlab`/`bitbucket`),
  `shared/git.ts` (Zod contracts), git IPC channels, `renderer/.../SourceControl.tsx`
  and a Git rail entry; setup/flow wiring for GitHub-as-source and push-back.
- Changed: `shared/ipc.ts`, `main/ipc.ts`, `preload/index.ts`, `lib/api.ts`;
  `GuidedFlow.tsx` (real connect/publish), `NewProjectWizard.tsx` + `DesignInput.tsx`
  (GitHub source), `env-manager.ts` (detect `git`/`gh`).
- Invariants honored: user's own `git`/`gh` (no stored tokens, no account), local-first
  & transparent, spec-first gates before push, arg-array spawns confined to the project.
- Milestones: **M1** core git ops + Source Control panel + fix connect · **M2** connect
  + repo create + push folder + PR · **M3** GitHub-as-source scan→build→push-back ·
  **M4** non-destructive parallel refactor of existing screens · **M5** vibe engineering
  (Screen Creation) + live localhost app runtime · **M6** GitLab + Bitbucket via the
  provider abstraction.
