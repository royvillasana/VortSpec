# Tasks — Run-Canvas Comments

> Depends on **Run-Canvas hardening Phase 1 (stable node identity)**. Do not start Phase 2 (anchoring) until the Phase-1 fingerprint resolver exists. Commit at each phase boundary; each phase's checks pass through the UI + tests.

## Phase 0 — Decisions

- [x] Confirm the 5 open decisions in `design.md §8` (commit strategy, notification surface, mention source, auto-push, thumbnail capture). Record the choices at the top of `design.md`.

## Phase 1 — Schema + repo-backed store

- [x] Add `packages/core/src/shared/comment.ts`: zod schemas for `Anchor`, `CommentMessage`, `CommentThread`, and the mention/notify request/response shapes. Export types. (+ `newCommentId`, `parseMentions`.)
- [x] Add `packages/core/src/main/workspace/comment-store.ts`: `listThreads`, `upsertThread`, `resolveThread`, all resolving strictly inside `.vortspec/comments/` (reuse the `resolveInside` guard). One file per thread; messages append-only.
- [x] Register IPC channels `comments:list / comments:upsert / comments:resolve` (zod contract in `ipc.ts`), main handlers, preload wrappers, `VortSpecApi` methods, and the CT mock (stateful in-memory store).
- [x] Vitest: store round-trips a thread, guards path traversal, and merges an appended message without clobbering. (comment-store.test 8 + comment.test 5.)
- [x] **Done when:** a thread JSON can be written/read via IPC and lands under `.vortspec/comments/`.

## Phase 2 — Anchoring + Comment mode + pins

- [x] Guest: `resolveFingerprint(fp)` (reuses the Phase-1 fpToUid→byId maps) + streams `anchorRects` for watched fingerprints (re-emitted on scroll/resize/rebuild). A comment-mode click emits `commentTarget` `{ nodeId, fingerprint, label, component, rect }`; the **thumbnail is captured host-side** via `bridge.captureThumbnail` (webview `capturePage` crop, per decision #5 — `capturePage` is a host API, not available to the guest). Schema in `inspector-bridge.ts` (`setMode` += comment, `watchAnchors`, `commentTarget`, `anchorRects`).
- [x] `RunCanvas.tsx`: **Comment mode** in the mode toggle; a comment-mode click opens a new-thread composer anchored to the target. `CommentsLayer` renders pins as numbered bubbles (screen-space, constant size) at the streamed rects; unresolved anchors go to the "unanchored" rail with their thumbnails.
- [x] `CommentThread` popover: messages via `Markdown`, a composer, Resolve/Reopen. Post → `comments:upsert` (via `useComments`; auto-commit is Phase 4).
- [x] Playwright/CT (`comments.ct`): comment-mode composer posts a thread; a pin renders at its rect; the popover shows the message + Resolve; a lost anchor drops to the unanchored rail; **the pin re-anchors when the guest re-emits a moved rect** (post re-render). 5 tests.
- [x] **Done when:** a user can pin a comment to a live element; the pin follows it (streamed rects), survives a re-render (re-anchor test), and a lost anchor keeps its thumbnail in the rail. Live reopen persists via the Phase-1 store.

## Phase 3 — Mentions + GitHub notification

- [x] `comment-mentions.ts` (main): `collaborators(projectPath)` via `gh api repos/{owner}/{repo}/collaborators --paginate` (fallback contributors), zod-validated; `@handles` parsed by `parseMentions` (shared, Phase 1).
- [x] `notify(projectPath, threadId, messageId)`: posts the message body (its @handles notify) + a section link to the branch's **open PR** if one exists, else the rolling **"VortSpec review comments"** issue (create-or-append). Stores the receipt on `message.notified` (via `setMessageNotified`, bypassing the append-only merge). Degrades to a `{ notified:false, reason }` fix-it (never throws) on no mentions / no gh / signed out / no GitHub remote.
- [x] IPC `comments:collaborators` + `comments:notify`; preload + api + CT mock.
- [x] @mention autocomplete in the composer (typing `@` filters `comments:collaborators`; Enter/click inserts the handle). `useComments` fetches collaborators + calls `notifyComment` after a mentioned post, surfacing the outcome as a dismissible notice; a notified message links out to its GitHub thread.
- [x] Vitest (`comment-mentions.test`, 8): `chooseSurface` prefers an open PR over the issue; `buildNotifyBody` carries body/label/route/file; graceful no-mentions / signed-out / no-remote / not-found all return a fix-it, never throw. `@handle` extraction covered by `comment.test` (Phase 1).
- [x] **Done when:** posting a comment that @mentions a collaborator posts to the branch's PR-or-issue via the user's own `gh` (so GitHub emails the mention); with no remote/auth the comment saves locally and the panel shows a clear "connect GitHub to notify" note. (The live GitHub round-trip is the hands-on pass; the degradation paths + surface choice are unit-tested, and the notice/link are CT-covered.)

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
