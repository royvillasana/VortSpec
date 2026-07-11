# source-control Specification

## Purpose
TBD - created by archiving change git-provider-integration. Update Purpose after archive.
## Requirements
### Requirement: Drive the user's own git and provider CLIs
The app SHALL perform all Git operations by spawning the user's installed `git` and
provider CLI (`gh`, later `glab`) as argument arrays confined to the project folder,
storing no provider tokens and requiring no VortSpec account.

#### Scenario: No stored credentials
- **WHEN** any Git or provider operation runs
- **THEN** it uses the user's own `git`/`gh` config + keychain, VortSpec stores no token,
  and the command is spawned with an argument array (no shell-string interpolation)

### Requirement: Connect a GitHub account
The "Connect to GitHub" action SHALL detect the user's `gh` auth state and guide login
when signed out.

#### Scenario: Already authenticated
- **WHEN** the user clicks Connect and `gh auth status` reports a logged-in account
- **THEN** the app shows the connected account and enables repo/push actions

#### Scenario: Not authenticated
- **WHEN** `gh` is signed out (or missing)
- **THEN** a fix-it card guides the user through `gh auth login` (or installing `gh`) and
  re-checks — the app never handles the token itself

### Requirement: Git task set through the UI
The Source Control panel SHALL expose status, branch create/switch/list (no delete),
stage/unstage, commit, pull, push, fetch, and diff, each mapping to a visible git command.

#### Scenario: Branch + commit + push
- **WHEN** the user creates a branch, stages changes, commits, and pushes
- **THEN** each action runs the corresponding git command in the project folder and the
  panel reflects the resulting status (branch, ahead/behind, clean/dirty)

### Requirement: Never delete a branch
VortSpec SHALL have no branch-deletion capability — not for existing branches and not for
branches it created — and SHALL NOT rewrite remote history.

#### Scenario: No delete anywhere
- **WHEN** the user is in the Source Control panel
- **THEN** there is no delete-branch action, the GitAdapter exposes no `deleteBranch` or
  `push --delete`, and the IPC surface accepts no branch-deletion request

#### Scenario: No history rewriting
- **WHEN** any push runs
- **THEN** it is a normal (non-force) push; VortSpec never force-pushes or deletes remote
  refs, and never silent-pushes to `main`

#### Scenario: Discard is local-only and gated
- **WHEN** the user discards local working-tree changes
- **THEN** it requires explicit confirmation and affects only the local working tree, not
  any branch or the remote

### Requirement: Create a repository and push the folder
The app SHALL create a repository via the provider CLI and push the project folder.

#### Scenario: New repo from a folder
- **WHEN** the user creates a repo (name/visibility) for an un-pushed project
- **THEN** the app runs `gh repo create`, sets the remote, and pushes the folder to it

### Requirement: Select among multiple accounts
Every connect flow SHALL detect the accounts available for a tool and, when more than one
exists, prompt the user to choose which to connect — never silently assuming one. This
applies to all connectable tools (GitHub, GitLab, Bitbucket, Jira, and where applicable
other integrations).

#### Scenario: Multiple accounts detected
- **WHEN** the user connects a tool and more than one account/host/site is available
- **THEN** the app presents an account picker and connects only the chosen one, remembering
  the choice per project as a reference (login/host/site id), not a credential

#### Scenario: Single account
- **WHEN** exactly one account is available
- **THEN** it is used without a picker, and the connected account is shown

### Requirement: Provider abstraction
Git operations SHALL be provider-agnostic behind a `GitProvider` interface so GitHub,
GitLab, and Bitbucket share the same Source Control UI.

#### Scenario: GitHub first, others later
- **WHEN** the GitHub provider is implemented
- **THEN** connect/create-repo/open-PR route through the interface, and adding GitLab
  (`glab`) or Bitbucket is a new provider implementation without UI changes

