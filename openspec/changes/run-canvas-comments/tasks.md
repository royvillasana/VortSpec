# Tasks — Run-Canvas Comments

> Depends on **Run-Canvas hardening Phase 1 (stable node identity)**. Do not start Phase 2 (anchoring) until the Phase-1 fingerprint resolver exists. Commit at each phase boundary; each phase's checks pass through the UI + tests.

## Phase 0 — Decisions

- [ ] Confirm the 5 open decisions in `design.md §8` (commit strategy, notification surface, mention source, auto-push, thumbnail capture). Record the choices at the top of `design.md`.

## Phase 1 — Schema + repo-backed store

- [ ] Add `packages/core/src/shared/comment.ts`: zod schemas for `Anchor`, `CommentMessage`, `CommentThread`, and the mention/notify request/response shapes. Export types.
- [ ] Add `packages/core/src/main/workspace/comment-store.ts`: `listThreads`, `upsertThread`, `resolveThread`, all resolving strictly inside `.vortspec/comments/` (reuse the `resolveInside` guard). One file per thread; messages append-only.
- [ ] Register IPC channels `comments:list / comments:upsert / comments:resolve` (zod contract in `ipc.ts`), main handlers, preload wrappers, `VortSpecApi` methods, and the CT mock.
- [ ] Vitest: store round-trips a thread, guards path traversal, and merges an appended message without clobbering.
- [ ] **Done when:** a thread JSON can be written/read via IPC and lands under `.vortspec/comments/`.

## Phase 2 — Anchoring + Comment mode + pins

- [ ] Guest: add `resolveAnchor(fingerprint)` (reuse the Phase-1 resolver) and a `captureAnchor(nodeId)` that returns `{ fingerprint, rect, thumbnail, label }` (thumbnail via webview `capturePage` crop). Emit these on demand over the bridge (schema in `inspector-bridge.ts`).
- [ ] `RunCanvas.tsx`: add **Comment mode** to the mode toggle; in Comment mode a click resolves the target and opens a new-thread composer anchored to it. Render existing pins on the overlay (same transform as hover/select) as numbered bubbles; unresolved anchors go to an "unanchored" rail with their thumbnails.
- [ ] `CommentThread` popover: messages (render via `Markdown`), a composer, Resolve/Reopen. Post → `comments:upsert` (+ commit, Phase 4).
- [ ] Playwright/CT: enter Comment mode, drop a pin on a fixtured element, assert the thread + pin persist and re-anchor after a re-render (uses the Phase-1 fixture).
- [ ] **Done when:** a user can pin a comment to a live element, reopen the app, and the pin is still on it (or in the unanchored rail with its thumbnail).

## Phase 3 — Mentions + GitHub notification

- [ ] `comment-mentions.ts` (main): `collaborators(projectPath)` via the provider's authed `gh api …/collaborators` (fallback contributors); parse `@handles` from a message body.
- [ ] `notify(projectPath, threadId, messageId)`: post the mention to the branch's open PR if one exists, else create/append the rolling "VortSpec review comments" issue; include @handles + section label + route + deep link; return the receipt URL; store it on `message.notified`. Degrade to a fix-it when no remote/auth (never throw).
- [ ] IPC `comments:collaborators` + `comments:notify`; preload + api + mock.
- [ ] @mention autocomplete in the composer (from `comments:collaborators`).
- [ ] Vitest: `@handle` extraction; notify chooses PR-over-issue; graceful no-remote path returns a fix-it, not a throw.
- [ ] **Done when:** posting a comment that @mentions a collaborator produces a GitHub issue/PR mention (verified against a test repo) and the mentioned user receives GitHub's email; with no remote, the comment saves and shows a clear "connect GitHub to notify" note.

## Phase 4 — Sync (commit + Share)

- [ ] On post/resolve, stage **only** the single comment file and commit it (`vortspec(comment): …`) via the existing git layer — never stage the user's other changes.
- [ ] A **Share** action pushes the comment commits (manual, no surprise network writes); surface push errors as fix-its. Pull is the user's normal `git pull`.
- [ ] CT/unit: posting stages exactly one file; Share calls push; failures are fix-it sentences.
- [ ] **Done when:** teammate B pulls and sees teammate A's comment pinned on the same section.

## Phase 5 — Comments panel + filters

- [ ] `CommentsPanel` tab: list threads with filters (Open / Resolved / @me / Mine), jump-to-pin, unanchored section with thumbnails, "view on GitHub" when notified.
- [ ] CT: filters narrow the list; clicking a thread selects its pin.
- [ ] **Done when:** all threads are browsable/filterable and jump the canvas to their pin.

## Phase 6 — Verification

- [ ] `pnpm build && pnpm test && pnpm lint` green.
- [ ] End-to-end through the UI: pin a comment, @mention a teammate, Share, have the teammate pull + see it and receive the GitHub email; resolve it; confirm anchor survives an HMR re-render (relies on Phase 1).
- [ ] Two-framework check (React and non-React page) — anchoring stays framework-agnostic.
- [ ] Review pass: confirm no comment path writes outside `.vortspec/comments/`, no VortSpec-side account/server/keys, notification uses only the user's GitHub auth, all wire shapes are zod at the boundary, no `any` outside fixtures.
