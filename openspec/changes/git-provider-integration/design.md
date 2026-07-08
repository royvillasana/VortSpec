# Design — Git provider integration

## Guiding constraints (from CLAUDE.md)

- **The user's own tools/credentials.** VortSpec drives the user's installed `git` and
  `gh` (later `glab`) exactly as it drives `claude` — it stores **no** provider tokens,
  requires **no** VortSpec account, and never re-implements auth. Auth lives in the
  user's `gh`/`git` config and keychain.
- **Local-first & transparent.** Every operation is a real git command run in the
  project folder; the Source Control panel shows the command and its output. State is
  derivable from the working tree + `git status` — nothing cached that git already knows.
- **Spec-first gates.** Generated artifacts (tokens/components/manifest) are approved via
  the existing flow gates before a push that publishes them.
- **Safe process handling.** All spawns are argument arrays (`spawn(cmd, args, {cwd})`),
  confined to the selected project folder, `shell:false` — **never** shell-string
  interpolation of user input (branch names, messages, URLs are argv, not interpolated).

## Component architecture

### GitAdapter (main) — the single CLI-knowledge boundary
`main/git/git-adapter.ts` wraps `git` and delegates provider-specific actions to a
`GitProvider`. One-shot commands via a small `run(cmd, args, cwd)` helper (arg-array,
`shell:false`, captured stdout/stderr, non-zero → typed error). Surface (M1 unless noted):

- **Inspect**: `status` (porcelain v2 → structured: branch, ahead/behind, staged,
  unstaged, untracked, conflicts), `currentBranch`, `branches` (local+remote), `log`
  (recent), `diff` (path/staged), `remotes`, `isRepo`.
- **Mutate**: `init`, `stage`/`unstage` (paths), `commit` (message via argv), `checkout`
  (switch), `createBranch`, `fetch`, `pull`, `push` (with `--set-upstream` for new
  branches). **No `deleteBranch` — ever** (see guardrail below).
- **Provider (via GitProvider)**: `authStatus`, `authLoginHint` (surface interactive
  login), `createRepo`, `openPullRequest`, `cloneUrlFor`.

Long-running/streaming operations (clone, push, pull, fetch) reuse the run-event stream
model so the Source Control panel shows live progress and they're cancelable — the same
mechanism as agent runs and the dev server.

### GitProvider interface — pluggable providers
```
interface GitProvider {
  id: 'github' | 'gitlab' | 'bitbucket'
  cli: string                       // 'gh' | 'glab' | (bitbucket: git + REST)
  authStatus(): Promise<{ authed: boolean; account?: string; hint?: FixIt }>
  createRepo(opts): Promise<{ url: string; sshUrl: string }>
  openPullRequest(opts): Promise<{ url: string }>
}
```
`providers/github.ts` (M2) drives `gh` (`gh auth status`, `gh repo create`,
`gh pr create`). `gitlab.ts` (`glab`) and `bitbucket.ts` (git + REST/app-password) land
in M4 behind the same interface and the same Source Control UI.

### Auth: detect, don't perform (headless can't do interactive login)
`gh auth login` is interactive (browser/device code). VortSpec **detects**
`gh auth status`; when signed out it shows a fix-it card that either opens the login
(`gh auth login --web`) in the user's terminal or instructs `! gh auth login`, then
re-checks — the same pattern the session uses for other interactive logins. VortSpec
never handles the token. `env-manager` gains `git` and `gh` presence/version checks.

### IPC + renderer
- `shared/git.ts`: Zod schemas — `gitStatus`, `gitBranch`, `providerAuth`,
  `repoCreateRequest`, `pushRequest`, etc. Contracts added to `ipcContract`, handlers in
  `main/ipc.ts`, methods in `preload`, typed `api.*`. Streaming git ops reuse the
  agent-event channels (or a parallel `git:event` channel) so progress + cancel work.
- `renderer/.../views/SourceControl.tsx`: a rail-reachable panel — repo header
  (provider, remote, branch, ahead/behind), a branch switcher/manager, a changes list
  (stage/unstage/discard), a commit box, and Pull/Push/Fetch/Open-PR actions; each shows
  the underlying command + streamed output. Errors render as fix-it cards.

## Bidirectional design-source flow (M3)

Setup already has `design_source: github` (repo URL/branch/component dir). M3 makes it
real:
1. **Pull in**: clone/pull the repo into the project folder (GitAdapter), on the chosen
   branch.
2. **Scan → build**: run the SDD-DE source-driven pipeline with the repo as the source —
   extract design tokens and detect components from the repo's files, then build them in
   the selected framework/language locally (reuses the existing Foundation/components
   stages; the source adapter is "repo files" instead of Figma).
3. **Push back**: after the spec-first gate, GitAdapter creates a new branch (app-named,
   e.g. `vortspec/design-system`) **or** the user's chosen branch, stages the generated
   tokens/components/DESIGN.md, commits, pushes, and opens a PR via the provider. The
   user chooses "new branch + PR" vs "push to <branch>" — never a silent push to `main`.

## Non-destructive parallel refactor (M4)

Once the design system is built (tokens + components + Storybook + DESIGN.md), VortSpec
can migrate the repo's existing screens onto it **without touching a line of the
originals** — the "duplicate to match, then let them disconnect/connect" model:

1. **Map.** Discover the repo's screens/pages and the UI they compose; map their legacy
   markup/components to the new token-driven components. Claude Code does this (the engine),
   reading DESIGN.md as the hand-off plus the built component library.
2. **Duplicate.** Generate a NEW parallel implementation of each screen against the new
   components — as new files in a clearly separated namespace (e.g. a `vortspec/` route
   tree, a `*.vortspec.tsx` sibling, or a build/feature flag). The originals are never
   edited, moved, or deleted. Old and new coexist in the tree.
3. **Preview.** The duplicated screens render (Storybook / dev server) so the team compares
   old-vs-new 1:1 before committing to anything.
4. **Hand off the switch.** Delivered on a new branch + PR (additive git only — no delete,
   no overwrite). The cutover — disconnecting the old implementation and wiring the new — is
   a deliberate human step the team takes when satisfied; VortSpec never flips it and never
   removes the old code. A generated `MIGRATION.md` maps each old screen → its new duplicate
   and lists the exact switch-over steps.

Guarantees: originals untouched; additive files only; zero deletions/overwrites; the PR is
the review surface; the team owns the cutover. This is a strangler-fig migration, gated by
the same spec-first approval and the additive/no-delete git guardrail.

## Vibe engineering + live localhost runtime (M5)

Closes the loop after the design system is built and pushed — build screens *and run them*
without leaving VortSpec:

- **Screen Creation (vibe engineering).** The user describes a screen/feature in the app;
  VortSpec runs the SDD-DE Screen Creation cycle (enrich-brief → generate-artifacts →
  implement) composing it from the built components + tokens, with DESIGN.md as the AI
  hand-off. Conversational + iterative through the assistant, spec-first gated, written as
  normal project files. Publishing follows the additive/no-delete git guardrail.
- **Live localhost app runtime.** Extend the existing dev-server manager (which today
  prefers `storybook` → `dev` → `start` → `preview`) to run the project's own **app** dev
  server (e.g. `dev`) as a distinct managed surface, parse its local URL, and embed/link
  the running app — separate from the Storybook component preview. Confined to the project
  folder, arg-array spawn, cancelable via the existing dev-server controls. Hot reload means
  a vibe-engineered change is visible in the running app immediately, closing the loop.

Reuses the AssistantDock/guided-run plumbing for the conversation and `dev-server.ts` for
the runtime — no new engine, Claude Code still does the building.

## Milestones

- **M1** — GitAdapter core (status/branch/stage/commit/pull/push/fetch/diff) + Source
  Control panel + `git`/`gh` env checks + fix the dead connect button (wire to
  `authStatus` + login guidance). *Done when:* a project's real git state renders and the
  user can branch/stage/commit/push through the UI.
- **M2** — GitHub provider: connect (`gh auth`), `createRepo`, push the folder, open PR.
  *Done when:* from a fresh folder, the user connects GitHub, creates a repo, and pushes.
- **M3** — GitHub as a design source: clone/scan → build locally → gated push-back on a
  new/chosen branch + PR. *Done when:* a repo becomes a built design system and the
  result is pushed back as a PR.
- **M4** — Non-destructive parallel refactor: duplicate the repo's existing screens onto
  the built design system as new parallel files (originals untouched), delivered on a new
  branch + PR with a `MIGRATION.md`. *Done when:* existing screens have token-driven
  duplicates in a PR, the originals are byte-for-byte intact, and the cutover is left to
  the team.
- **M5** — Vibe engineering + live localhost runtime: compose screens conversationally
  from the built design system (Screen Creation, gated) and run the project's app dev
  server embedded in VortSpec. *Done when:* a user describes a screen, it's built from the
  components, and it renders in a live localhost app inside the app.
- **M6** — Provider abstraction realized for GitLab (`glab`) and Bitbucket behind the
  same interface + UI. *Done when:* connect + push-back work for a GitLab and a Bitbucket
  repo.

## Risks / decisions

- **`gh` dependency.** Repo-create/PR need `gh` (or `glab`). If absent, degrade to plain
  `git` (push to an existing remote) and surface an install hint for `gh`. Plain git
  operations never require `gh`.
- **Interactive auth.** Can't be done headlessly; we detect + guide. Accepted — matches
  the "user's own tools" invariant and the session's interactive-login pattern.
- **Never delete a branch (hard guardrail).** VortSpec has no branch-deletion capability
  at all — not for existing branches and not for ones it created. The GitAdapter exposes
  no `deleteBranch`/`push --delete`, the Source Control UI has no delete affordance, and
  the IPC surface never accepts a delete. It is create-and-work-in-branch + pull/push/
  stage/commit/fetch only — additive and non-destructive to the remote. Likewise no
  history rewriting: **no force-push and no `--delete` of remote refs.** (Local
  working-tree discard stays confirm-gated; no silent pushes to `main`.)
- **Portability.** `git`/`gh` are cross-platform; the adapter avoids shell features so
  Windows/Linux support is a contained change (like node-pty concerns).
- **Scope creep.** M1–M2 deliver the user's immediate need (connect + push); M3–M4 are
  sequenced after and gated by the PRD "Done when" checks.
