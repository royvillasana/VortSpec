# Tasks — Background verify & build pipeline

## 1. Harness provisioning
- [x] 1.1 Add `ensureHarness(projectPath)` renderer helper: `getPreviewInfo` → run
  `/storybook` bootstrap op if no Storybook → `startDevServer` → await `running` URL via
  `onDevServerUpdate` (timeout ~90s) → return `{ url | null }`.
- [x] 1.2 Reuse the existing DevPreview Storybook-setup prompt for the bootstrap; keep it
  idempotent (skips when `.storybook` exists).

## 2. Autonomous verify
- [x] 2.1 Replace `verifyOnePrompt`/`VERIFY_ALL_PROMPT` with prompts that take the harness
  URL + figma file url, run `/visual-verify` then `/adversarial-review` autonomously,
  forbid asking the user to perform steps, honor the headless constraint, and end with
  `VERIFY: PASS|ISSUES (n)`.
- [x] 2.2 Keep Write/Edit in the verify op tools so the agent fixes + writes reports.

## 3. Outcome-not-process UI
- [x] 3.1 Add a compact task-card that shows label + spinner while running and, on done,
  the verification summary from `api.getVerification` (✓ passed / ⚠ N issues + top
  finding) with "View details" → RunPanel/Run screen.
- [x] 3.2 Use the card for verify + pipeline; keep RunPanel behind "View details".

## 4. Build & verify pipeline
- [x] 4.1 Add `buildAndVerifyRest()`: iterate detected (unbuilt) components sequentially;
  per component one op chaining Apply → Verify (harness ensured once up front).
- [x] 4.2 Make "Build & verify the rest" the primary CTA; keep "Build only (no verify)"
  secondary and per-row Build/Verify.
- [x] 4.3 Summary card: built & verified k/n, m need attention.

## 5. Reconnect + no double-start
- [x] 5.1 On mount, adopt an in-flight run for this project (via `useLatestRun`/run state)
  so returning shows live status + card.
- [x] 5.2 Disable Build/Verify/Re-scan/pipeline start actions while a run is in progress.

## 6. Tests + gate
- [x] 6.1 CT: verify shows the outcome card (mock report), not the raw checklist; "Build
  & verify the rest" present; start actions disabled while running; reconnect shows an
  active run.
- [x] 6.2 Unit: `ensureHarness` bootstrap/skip logic where extractable.
- [x] 6.3 `pnpm typecheck && pnpm test && pnpm test:ct && pnpm build && pnpm lint` green.

## 7. Ship
- [ ] 7.1 Bump version, build + deep-ad-hoc-sign + package universal dmg, release, verify
  the site download.
- [ ] 7.2 Manual E2E: scan a few → rescan for the rest → build & verify runs in the
  background with no user steps; re-verify shows the outcome card.
