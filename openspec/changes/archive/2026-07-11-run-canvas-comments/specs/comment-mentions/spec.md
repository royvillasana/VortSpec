## ADDED Requirements

### Requirement: @mention autocomplete from the repo's collaborators

The comment composer SHALL offer @mention autocomplete sourced from the project's GitHub collaborators (falling back to repository contributors when the collaborator list is unavailable), resolved through the user's existing authenticated GitHub. The candidate list SHALL be cached per repository.

#### Scenario: Autocomplete lists collaborators

- **WHEN** the user types `@` in a comment composer on a GitHub-remote project
- **THEN** the composer SHALL suggest the repo's collaborators (or contributors as a fallback) to mention

### Requirement: Mentions notify via the user's own GitHub (no VortSpec server)

When a posted comment @mentions collaborators, VortSpec SHALL post that mention to a GitHub surface that triggers GitHub's native notifications — the branch's open pull request if one exists, otherwise a rolling "VortSpec review comments" issue — authenticated as the user via the existing provider. The mention SHALL include the @handles, the comment body, the section label, the app route, and a link back to the thread. VortSpec SHALL store no accounts, keys, or telemetry and SHALL run no notification server of its own; it SHALL rely solely on the user's GitHub. The created issue/PR-comment URL SHALL be recorded on the message so the mention is not re-posted.

#### Scenario: Mention triggers a GitHub notification

- **WHEN** the user posts a comment mentioning `@ana` on a project whose GitHub remote they are authenticated to
- **THEN** VortSpec SHALL post the mention to the branch's open PR (or a rolling issue) so that GitHub emails `@ana`, and SHALL store the resulting URL on the message

#### Scenario: Mention degrades without GitHub

- **WHEN** the project has no GitHub remote or the user is not authenticated
- **THEN** the comment SHALL still save, and the mention SHALL surface a fix-it ("Connect GitHub to notify @ana") instead of failing — no exception, no VortSpec-side email

#### Scenario: No double-posting

- **WHEN** a mention has already been notified (a stored receipt URL exists)
- **THEN** re-saving or re-opening the thread SHALL NOT post the mention to GitHub again
