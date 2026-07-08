# Tasks — Git provider integration

## M1 — Core git ops + Source Control panel + fix connect
- [x] 1.1 `shared/git.ts`: Zod schemas — `GitStatus` (branch, ahead/behind, staged/
  unstaged/untracked/conflicts), `GitBranch`, `GitRemote`, `GitLogEntry`, `GitDiff`,
  request types (stage/commit/branch/checkout/push/pull).
- [x] 1.2 `main/git/git-adapter.ts`: `run(cmd,args,cwd)` (arg-array, shell:false, typed
  errors); inspect (`isRepo`, `status` via porcelain v2, `currentBranch`, `branches`,
  `remotes`, `log`, `diff`); mutate (`init`, `stage`, `unstage`, `commit`, `checkout`,
  `createBranch`, `fetch`, `pull`, `push` w/ `--set-upstream`). NO `deleteBranch` and no
  force-push — the adapter exposes no branch-deletion or history-rewrite capability.
- [~] 1.3 Stream long ops (fetch/pull/push) through the run-event model so progress shows
  and they're cancelable.
- [x] 1.4 IPC: `git:*` channels + handlers + preload + `api.*`. Zod at the boundary.
- [x] 1.5 `env-manager`: detect `git` (+ version) and `gh` presence.
- [x] 1.6 `renderer/.../views/SourceControl.tsx` + Git rail entry: repo header, branch
  switcher + create (NO delete affordance), changes list (stage/unstage/discard),
  commit box, Pull/Push/Fetch; each shows the underlying command + streamed output;
  errors as fix-it cards.
- [x] 1.7 Fix the dead "Connect to GitHub" button: wire it to provider `authStatus` +
  the login guidance card.
- [x] 1.8 Tests: adapter unit (porcelain parsing, arg-array safety), Source Control CT.
- [x] 1.9 Gate green; Done-when: real git state renders; branch/stage/commit/push via UI.

## M2 — GitHub provider: connect, repo create, push folder, PR
- [x] 2.1 `GitProvider` interface + `providers/github.ts` (`gh auth status`,
  `gh repo create`, `gh pr create`); resolve provider by remote/config.
- [x] 2.2 Connect flow: detect `gh auth`; signed-out → guide `gh auth login --web` (or
  install `gh`), then re-check. Never handle the token.
- [x] 2.2a Generic multi-account picker: detect available accounts (`gh auth status`
  lists accounts/hosts; `gh auth switch` to select) and, when >1, prompt which to connect;
  remember the choice per project as a reference. Built once here, reused by GitLab,
  Bitbucket, and Jira.
- [x] 2.3 Repo-create dialog (name, visibility, description) → `gh repo create` → set
  remote → push the folder.
- [x] 2.4 Open-PR action (branch → base) via `gh pr create`; degrade to plain-git push
  when `gh` is absent.
- [x] 2.5 Tests + gate; Done-when: connect → create repo → push a fresh folder.

## M3 — GitHub as a design source (bidirectional)
- [~] 3.1 Setup/DesignInput: choose a GitHub repo + branch as the design source; clone/
  pull into the project folder; record in project config.
- [x] 3.2 Source-driven pipeline with source = repo files: extract tokens + detect
  components, build in the selected framework/language (reuse Foundation/components stages).
- [x] 3.3 Push-back (gated): create a new branch (app-named) or use the chosen branch;
  stage + commit + push the generated tokens/components/DESIGN.md; open a PR. Never
  silent-push to `main`; unavailable until the flow gate is approved.
- [x] 3.4 Tests + gate; Done-when: a repo becomes a built design system pushed back as a PR.

## M4 — Non-destructive parallel refactor
- [ ] 4.1 Screen/page discovery: map the repo's existing screens + the UI they compose.
- [ ] 4.2 Duplicate each screen against the built components as NEW parallel files (route
  tree / `*.vortspec.tsx` sibling / build flag) — Claude Code re-implements using DESIGN.md;
  originals never edited/moved/deleted.
- [ ] 4.3 Side-by-side preview (old vs new).
- [ ] 4.4 Deliver on a new branch + PR (additive; no delete/overwrite) with a generated
  `MIGRATION.md` (old screen → new duplicate + switch-over steps); cutover is a human step.
- [ ] 4.5 Tests + gate; Done-when: existing screens have token-driven duplicates in a PR,
  originals byte-for-byte intact.

## M5 — Vibe engineering (Screen Creation) + live localhost runtime
- [ ] 5.1 Screen Creation flow in the app: describe a screen → SDD-DE enrich → generate-
  artifacts → implement, composing from the built components + tokens (DESIGN.md hand-off),
  conversational via the assistant, spec-first gated.
- [ ] 5.2 Extend `dev-server.ts` + IPC to run the project's own APP dev server as a distinct
  managed surface (separate from Storybook), parse the local URL, embed/link the running app,
  cancelable via existing dev-server controls.
- [ ] 5.3 A "Run app" preview surface + rail entry; live iteration (hot reload reflects
  vibe-engineered changes).
- [ ] 5.4 Tests + gate; Done-when: describe a screen → built from components → renders in a
  live localhost app inside VortSpec.

## M6 — GitLab + Bitbucket
- [ ] 6.1 `providers/gitlab.ts` (`glab`) behind `GitProvider`; connect (multi-account) + repo + MR.
- [ ] 6.2 `providers/bitbucket.ts` (git + REST/app-password) behind `GitProvider`.
- [ ] 6.3 Provider picker in connect/setup; same Source Control UI for all three; reuse the
  generic multi-account picker (2.2a).
- [ ] 6.4 Tests + gate; Done-when: connect + push-back work for a GitLab and a Bitbucket repo.

## M7 — Jira integration
- [ ] 7.1 `TaskProvider` interface + `providers/jira.ts`: connect the user's Jira account —
  prefer the user's Atlassian/Jira CLI. If no CLI is present when the user selects Jira,
  offer to install it **with explicit permission** (confirm prompt showing what/how), then
  drive its login; only if declined, fall back to an Atlassian API token in the OS keychain
  (`safeStorage`). Multi-account aware (reuse 2.2a): pick the site/account when >1.
- [ ] 7.2 `shared/task.ts` Zod contracts + IPC + preload + api; list projects/boards.
- [ ] 7.3 Create stories/issues; write/update fields (summary, description, acceptance
  criteria); every write an explicit user action.
- [ ] 7.4 "The spec is the story": turn a VortSpec spec into a story and link the
  spec/component/screen ↔ issue; read + display linked story status.
- [ ] 7.5 A Jira/Tasks panel + rail entry; connect card with account picker; errors as fix-its.
- [ ] 7.6 Tests + gate; Done-when: connect a chosen Jira account and create a story from a spec.

## Ship (per milestone)
- [ ] S.1 Each milestone: `pnpm typecheck && pnpm test && pnpm test:ct && pnpm build &&
  pnpm lint` green, then bump + build + sign + release + verify the site download.
 (M1: one-shot ops with a busy spinner; full run-event streaming deferred)