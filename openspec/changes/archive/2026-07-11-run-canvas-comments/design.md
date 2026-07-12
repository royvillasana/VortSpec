# Design — Run-Canvas Comments (repo-backed, GitHub-notified)

## Goal restated

Anchor a comment to a **section of the live app** in the Run Canvas; store it **in the project's Git repo** so teammates see it on pull; **notify mentioned users by email** without a VortSpec server — by riding on the user's own GitHub. Must uphold: local-first, the user's own accounts, no keys/telemetry/proxy, framework-agnostic anchoring.

## Decisions (confirmed 2026-07-11)

All five §8 defaults were accepted:

1. **Commit strategy** — comment files are committed on the **working branch** (they travel with the branch, like code).
2. **Notification surface** — a @mention posts to the branch's **open PR if one exists, else a rolling issue** ("VortSpec review comments").
3. **Mention source** — @mention autocomplete lists the repo's **collaborators**, falling back to **contributors** when that API is unavailable.
4. **Auto-push vs manual** — posting **auto-commits** the single comment file but **does not push**; the user pushes via an explicit **Share** action (no surprise network writes).
5. **Thumbnail capture** — pin thumbnails are a **webview `capturePage`** crop (no extra guest dependencies).

## 1. Anchoring a comment to a section

A comment's anchor must resolve to "the same logical element" on **another machine, another render, another app version**. It reuses the **stable node identity** from Run-Canvas Phase 1 and adds resilience:

```
Anchor {
  fingerprint: string      // the Phase-1 serializable DOM-path fingerprint
  component: string | null // resolved component name (data-component / heuristic)
  file: string | null      // source file of the component, when known
  label: string            // human label ("Button in Header", "Card title")
  rectHint: { x, y, w, h }  // last-seen viewport-relative rect (fallback placement)
  thumbnail: string        // small (~160px) data-URL screenshot of the element
  route: string | null     // the app route/path the pin was made on (for multi-page apps)
}
```

Resolution order when opening the canvas:
1. **Fingerprint resolve** (Phase-1 resolver) → exact element → pin sits on it, tracks its live rect.
2. **Fail** → pin shows as **unanchored**: rendered in a side rail with its `thumbnail` + `label` + `route`, one click to "locate on page" using `rectHint` as a best-effort. Never silently drops.

The guest already computes the fingerprint (Phase 1) and can capture a small element screenshot (`element.getBoundingClientRect` + a canvas draw, or `html2canvas`-free via the webview's `capturePage` cropped to the rect). The thumbnail keeps a comment meaningful even when the anchor can't resolve.

**Framework-agnostic:** anchoring reads only the rendered DOM (fingerprint + rect + pixels). No `data-oid`, no build-time cooperation (invariant).

## 2. Storage — plain files in the repo

One file per thread under the project:

```
.vortspec/comments/<thread-id>.json
```

```
CommentThread {
  id: string                 // ULID-like, sortable, generated locally
  anchor: Anchor
  createdAt, updatedAt: ISO string
  resolved: boolean
  messages: CommentMessage[]  // append-only
}
CommentMessage {
  id: string
  author: { name: string; githubLogin: string | null; avatar?: string }
  body: string                // markdown; @handles are plain text tokens
  mentions: string[]          // github logins extracted from body
  createdAt: ISO string
  notified?: { github?: { issue: number; url: string } } // notification receipt
}
```

- **Why one file per thread + append-only messages:** two people commenting on different sections touch different files → no conflict; two replies to the same thread are additive lines → trivial 3-way merge. This is the git-friendliest shape.
- Read/write goes through a **workspace-root-guarded** core module (`comment-store.ts`) mirroring `fs-workspace.ts`'s `resolveInside` guard — never touches anything outside `.vortspec/comments/`.
- Author identity comes from `git config user.name` + the authenticated GitHub login (already available via the provider); avatar from the Profile.

## 3. Sync — how a comment reaches a teammate

Comments are files, so sync = commit + push; teammate = pull. The **decision** is how invasive the commit is:

- **Option A — commit onto the working branch (recommended default).** Posting a comment stages only `.vortspec/comments/<id>.json` and commits it with a scoped message (`vortspec(comment): …`). A **Share** button pushes. Pro: dead simple, comments travel with the branch/PR under review. Con: adds commits to the user's branch.
- **Option B — a dedicated `vortspec/comments` orphan-ish branch.** Comment commits go to a separate branch that teammates also pull. Pro: keeps the feature branch clean. Con: more Git plumbing, users must know to pull it; comments decouple from the code they annotate.
- **Recommendation:** ship **Option A**, because a design comment is *about the change under review* and belongs with it; make the commit obvious and scoped, and only stage the single comment file (never the user's other work).

Offline/no-remote: comments still write + commit locally; **Share/notify** simply says "no GitHub remote — comments are saved locally; connect a remote to share and notify."

## 4. Mentions + email notification — via the user's own GitHub

VortSpec runs no server, so it cannot send email. It leverages **GitHub's** notifications, authenticated as the user (same model as "your own Claude Code"):

- **Autocomplete source:** `gh api repos/:owner/:repo/collaborators` (fallback: contributors via `git shortlog -sne` / `gh api .../contributors`) → the @mention list. Cached per repo.
- **On post with mentions:** after the comment file is committed, `comment-mentions.notify()` posts the mention to a **GitHub surface** that emails on @mention:
  - **Recommended: a rolling "VortSpec review comments" GitHub Issue per branch/PR.** First mention creates the issue (title references the branch); subsequent mentions add issue comments. Each carries the @handles, the comment body, the section `label`, the `route`, and a deep link (`vortspec://…` or the repo file link) back to the thread. GitHub then emails every mentioned collaborator through their normal notification settings.
  - Alternatives considered: **PR review comments** (great when a PR exists for the branch — reuse it instead of a new issue) and **Discussions** (needs Discussions enabled). Design: **prefer the branch's open PR if one exists; else the rolling issue.**
- **Why not commit-message mentions:** GitHub does **not** email on @mentions in commit messages — only issues/PRs/discussions notify. So a GitHub thread is required for the email; the commit alone won't do it.
- **Receipt:** store the created issue/comment URL back on the `CommentMessage.notified` so we don't double-post and can link "view on GitHub."
- **Graceful degradation:** no remote / not authenticated / not a GitHub host → save + commit locally, surface a fix-it ("Connect GitHub to notify @ana") — never block the comment, never throw (invariant #5).

All of this uses the **existing** `git/github.ts` provider auth and `gh` CLI already wired for `providerCreatePR` etc. No new credentials.

## 5. UI

- **Mode toggle** in the Run Canvas header: `Interact · Inspect · Comment`. In Comment mode the cursor is a pin; clicking a section resolves its fingerprint and opens a new thread composer anchored there.
- **Pins** render on the existing overlay layer (same transform as hover/select boxes so they track at any zoom), as numbered bubbles; hovering shows the label; clicking opens the thread popover.
- **Thread popover:** messages (markdown via the existing `Markdown`/`Response` renderer), an @mention-autocomplete composer, Resolve/Reopen, "view on GitHub" when notified. Resolved threads dim their pin.
- **Comments panel:** a tab beside the Design panel listing threads with filters (Open / Resolved / @me / Mine) and per-thread jump-to-pin; shows unanchored threads with their thumbnails.
- Errors are fix-it sentences (no GitHub remote, mention failed to notify, anchor lost), never raw exceptions.

## 6. IPC surface (zod at the boundary)

- `comments:list(projectPath)` → CommentThread[]
- `comments:upsert(projectPath, thread)` → writes the file (guarded) + commits it
- `comments:resolve(projectPath, id, resolved)`
- `comments:collaborators(projectPath)` → mention candidates
- `comments:notify(projectPath, threadId, messageId)` → posts the GitHub mention, returns the receipt
All shapes defined in `packages/core/src/shared/comment.ts` (zod), preload-wrapped like the rest.

## 7. Invariants check

- **Local-first:** comments are plain project files; everything derivable from the repo. ✓
- **User's own accounts / no server:** notification is GitHub, authenticated as the user; VortSpec stores no keys, runs no service, sends no telemetry. ✓
- **Framework-agnostic:** anchor reads rendered DOM only; no project instrumentation. ✓
- **Safe process handling:** only the existing `git`/`gh` provider calls; no new spawns of user input. ✓
- **Human-sentence errors:** all failure modes (no remote, notify failed, anchor lost) render as fix-it cards. ✓
- **Not a code edit:** comments never write to source; the spec-first code-gate is untouched. ✓

## 8. Open decisions (surface before Phase 2 of tasks)

1. **Commit strategy** — Option A (working branch, recommended) vs B (dedicated branch). *Default A.*
2. **Notification surface** — reuse the branch's open PR if present, else a rolling issue. *Default: PR-if-exists → else issue.*
3. **Mention source** — collaborators vs contributors when the API is unavailable. *Default: collaborators, fall back to contributors.*
4. **Auto-push vs manual Share** — auto-commit on post, **manual push** via Share (avoid surprise network writes). *Default: manual Share.*
5. **Thumbnail capture** — webview `capturePage` crop vs a guest-side canvas. *Default: webview capturePage (no extra guest deps).*

## 9. Sequencing

Lands **after Run-Canvas Phase 1 (stable node identity)** — the anchor depends on it. Suggested order within this change: schema+store → anchoring/pins (Comment mode) → mentions+GitHub notify → Comments panel + filters → verification.
