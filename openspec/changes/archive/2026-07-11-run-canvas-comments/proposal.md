## Why

The Run Canvas lets a user select and inspect any component on the live app, but there is no way to **leave feedback pinned to what you're looking at**. Design review today happens out-of-band (Slack, a doc, a screenshot with an arrow) and loses the connection to the exact element. Teams want Figma-style **comments anchored to a section of the running app** — "this padding is too tight," "@ana can you make this the `lg` variant?" — that a teammate (or the same user later) can see in context, reply to, resolve, and be **notified about when mentioned**.

VortSpec is local-first and stores no VortSpec-side accounts or servers, so the comment system must not introduce one. The natural home is **the project's own Git repository**: comments live as plain files committed to the repo, so a teammate sees them on `git pull` — exactly how they already get code. And the **email notification on a mention rides on the user's own GitHub**, not a VortSpec service: when a comment @mentions someone, VortSpec posts that mention to GitHub (an issue/PR thread) through the user's existing authenticated GitHub, and GitHub's native notifications email them. No new server, no keys, no telemetry — consistent with invariant #4.

This depends on **stable node identity** (Run-Canvas hardening Phase 1): a comment must re-anchor to the same logical element across re-renders and across machines, so it can't use array-index ids.

## What Changes

- The Run Canvas gains a **Comment mode** (alongside Inspect / Interact): click a section of the live app to drop a **comment pin** anchored to that element; existing pins render as Figma-style bubbles on the overlay at their anchored positions.
- Clicking a pin opens a **thread popover**: the original comment, replies, an **@mention autocomplete** of the repo's collaborators, and **Resolve / Reopen**. A **Comments panel** (a tab in the Run section) lists all threads with filters (Open / Resolved / Mentioning me / Mine) and jumps the canvas to a pin.
- Comments are stored as **plain files in the project repo** under `.vortspec/comments/<thread-id>.json` (one file per thread → minimal merge conflicts). Each thread records its **anchor** (the stable node fingerprint + component/file + a small screenshot thumbnail + a human label), the author (name + GitHub handle), the messages, mentions, and resolved state. Committed to the repo → visible to teammates on pull.
- **Mentions notify via GitHub, using the user's own auth.** Posting a comment that @mentions collaborators creates or appends to a dedicated **GitHub issue thread** (or reuses the branch's open PR) that @mentions them and links back to the section — so GitHub emails them. When the repo has no GitHub remote or the user isn't authenticated, the comment still saves locally; the mention degrades to "not notified" with a clear fix-it note (never a hard error).
- **Sync** is explicit and Git-native: posting a comment writes + commits its file; a one-click **Share** pushes the comment commits so teammates can pull. (The exact branch strategy is a design decision — see design.md.)

## Capabilities

### New Capabilities
- `run-canvas-comments`: Comment mode in the Run Canvas — anchor a comment to a rendered section, thread replies, @mention collaborators, resolve/reopen; comment pins + thread popover + a Comments panel, all re-anchored through the stable node-identity resolver.
- `comment-store`: the repo-backed comment store — plain per-thread JSON files under `.vortspec/comments/`, read/written through workspace-root-guarded core handlers, committed and pushed through the existing Git/provider layer so comments travel with the project.
- `comment-mentions`: mention resolution + GitHub-backed notification — collaborator lookup for @mention autocomplete and a mention → GitHub-issue/PR bridge that triggers GitHub's native email notifications using the user's own authenticated GitHub (no VortSpec server/keys).

### Modified Capabilities
<!-- Extends run-canvas (adds Comment mode + pin overlay) and preview-inspector-bridge
     (reuses the stable node fingerprint for anchoring). No requirement-level change to the
     bridge protocol beyond exposing the existing stable id for anchor resolution. Reuses
     git-provider-integration (commit/push, provider auth) as-is. -->

## Impact

- **`packages/core` (main):** a new `comment-store` module (per-thread file read/write, workspace-root-guarded like `fs-workspace`); a `comment-mentions` module that resolves collaborators and posts a GitHub-issue mention through the existing `git/github.ts` provider auth; new zod-typed IPC channels (`comments:list/upsert/reply/resolve`, `comments:collaborators`, `comments:notify`) + preload wrappers. All wire shapes zod-validated at the boundary.
- **`packages/core` (shared):** a `comment.ts` schema module (thread / message / anchor / mention types) and the anchor type reused from the inspector bridge's stable-id fingerprint.
- **`apps/ide` guest (`guest.ts`):** a `resolveAnchor(fingerprint)` path (reuses the Phase-1 resolver) so a stored anchor re-acquires its element for pin placement; emit the current selection's fingerprint + rect + a small thumbnail when a comment is created. No new project-cooperation requirement (invariant: framework-agnostic).
- **`packages/ui`:** Comment mode in `RunCanvas.tsx` (pin overlay + placement), a `CommentThread` popover, a `CommentsPanel` list, and @mention autocomplete; wired into `RunApp.tsx` beside Inspect/Interact.
- **Reused, unchanged:** the stable node-identity resolver (Run-Canvas Phase 1), `git/github.ts` provider auth + commit/push, the Profile (author identity), the local-first `.vortspec/` convention.
- **Invariants upheld:** local-first (comments are plain files in the project repo); the user's own accounts (mentions notify via the user's GitHub, not a VortSpec server); no keys, no telemetry, no proxy; safe process handling (no new spawns beyond the existing `git`/`gh` provider calls). Comments are content, not source edits — the spec-first code-gate is unaffected.
- **Depends on:** Run-Canvas hardening **Phase 1 (stable node identity)** — anchors must survive re-renders and be portable across machines. This change lands after P1.
- **Risk:** anchor drift when a teammate's DOM differs (different data, viewport, or app version) — mitigated by storing a thumbnail + human label so a pin degrades to "unanchored, here's what it looked like" instead of vanishing. Merge conflicts on concurrent comments — mitigated by one file per thread and append-only messages.
