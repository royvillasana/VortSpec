> Both prior open questions are decided: the launch check is **not** defeatable (design D6), and `apps/desktop` gets only the compile-preserving edit (design D5).

## 1. Widen the update contract

- [x] 1.1 Record the live v0.1.35 `/releases/latest` payload as a test fixture (both DMG assets, real names and order) so the selector is tested against real shape, not an invented one
- [x] 1.2 Extend `updateInfoSchema` in `packages/core/src/shared/update.ts`: add an explicit reachability signal (so "offline" is distinct from "up to date"), the resolved `downloadArch`, and the timestamp of the result
- [x] 1.3 Change `system:checkUpdate` in `packages/core/src/shared/ipc.ts` to take `{ force: boolean }` instead of `z.void()`, and add the channel(s) for reading/writing dismissal state
- [x] 1.4 Update `packages/core/src/shared/api.ts` and `packages/core/src/preload/index.ts` for the new signatures
- [x] 1.5 Run `check-types` across the workspace and fix every call site the widened contract breaks (including `apps/desktop` and its CT mock API)

## 2. Fix and harden the checker

- [x] 2.1 Replace `dmgUrl()` in `packages/core/src/main/update/update-checker.ts` with an architecture-matched selector keyed on `process.arch`, returning null when nothing matches
- [x] 2.2 Unit-test the selector against the recorded payload: arm64 picks the arm64 DMG, x64 picks the Intel DMG, an unmatched arch yields null (this is the regression test for the current bug)
- [x] 2.3 Unit-test `compareVersions` at the boundaries the spec names: newer, equal, running-ahead, and a `v` prefix on the tag
- [x] 2.4 Add the persisted store in `app.getPath("userData")` (last result, checked-at, dismissed version), treating a missing or corrupt file as "never checked" and never as an error
- [x] 2.5 Implement the 4-hour throttle in `checkForUpdate({ force })`: cached within the interval, live when forced or expired
- [x] 2.6 Test the throttle: a second call inside the interval makes no request; `force: true` inside the interval does; an expired cache refreshes
- [x] 2.7 Test the failure modes the spec requires to be silent — offline, timeout/abort, HTTP 403 (rate limited), non-JSON body — each resolving as unreachable without throwing

## 3. Share the banner

- [x] 3.1 Move `UpdateBanner` from `apps/desktop/src/renderer/src/App.tsx` into `packages/ui/src/views/`, as a presentational CVA + `cn()` component with `forwardRef`, tokens only, no `api` calls and no persistence
- [x] 3.2 Point `apps/desktop` at the shared component and delete the local copy — compile-preserving only, no new behaviour and no CT coverage there
- [x] 3.3 Component-test the banner from a plain `UpdateInfo` object with no IPC mock: renders the version, fires each of the three actions, and labels the download with the resolved architecture

## 4. The initial screen (IDE)

- [x] 4.1 Fire the launch check from `apps/ide/src/renderer/src/App.tsx` in an effect with `force: false`, awaited by nothing and gating nothing — unconditional, with no toggle or flag to suppress it
- [x] 4.2 Render the banner on the initial screen (the `WorkspacePicker` surface, before a workspace is open) only when an update is available and not dismissed for that version
- [x] 4.3 Wire Download and What's new through `openInstall`, preferring the architecture-matched asset and falling back to the release page
- [x] 4.4 Wire Dismiss to persist the dismissed version
- [x] 4.5 Add `checkUpdate` to the IDE's CT mock API (mirroring `apps/desktop/tests/ct/support/mock-api.ts`)
- [x] 4.6 CT: update available → prompt appears naming the version; up to date → no prompt; offline → no prompt and no error
- [x] 4.7 CT: the initial screen is interactive while the check is still in flight, and the prompt appears only on resolution
- [x] 4.8 CT: a version dismissed on a previous launch stays suppressed; a newer version surfaces again

## 5. Settings

- [x] 5.1 Add the software-update section to `packages/ui/src/views/Profile.tsx`: running version always visible, plus the manual check control
- [x] 5.2 Implement the four distinct states — idle, checking (control disabled), result (up to date, naming the version checked against), unreachable
- [x] 5.3 Make the manual control pass `force: true`, and confirm it bypasses the throttle
- [x] 5.4 Reuse the shared banner (or its actions) for the update-available state, and confirm the section reports truthfully even when the prompt was dismissed
- [x] 5.5 Note in the section that checking contacts GitHub, so the outbound request is visible rather than hidden — this is the only disclosure, since the check cannot be turned off
- [x] 5.6 CT: each of the four states renders distinctly; "unreachable" is never presented as "up to date"; the control is re-enabled after a failed check

## 6. Verify end to end

- [x] 6.1 Run the full workspace `check-types`, unit tests, and both apps' CT suites — 6/6 typecheck, 1684 unit tests pass, IDE CT 164 passed (+21 new). The 46 CT failures are PRE-EXISTING: a clean-tree baseline run gives the identical 46 failed / 143 passed
- [x] 6.2 Verified the REAL checker against the LIVE v0.1.35 release (network + parse + asset pick, only version/arch/store overridden): 0.1.34+arm64 → arm64 DMG; 0.1.34+x64 → **intel** DMG (the bug, fixed against production data); 0.1.35 → no update; 0.9.9 → no downgrade. NOT done: launching the Electron app to see the banner on screen — the wiring is covered by CT instead
- [x] 6.3 Confirmed via the module's own abort path against an unroutable host (aborted at 8003ms, reported unreachable, cache not poisoned) and a DNS failure; CT covers the screen staying interactive while the check is in flight
- [x] 6.4 Update `openspec/specs/` via `/opsx:sync` — synced in #108: `app-updates` created (6 requirements), `ide-shell` and `profile` each gained one. Purely additive; 69/69 specs validate
