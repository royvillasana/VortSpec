## Context

Most of this capability already exists and reaches nobody.

`packages/core/src/main/update/update-checker.ts` implements `checkForUpdate()`: an 8-second, unauthenticated `GET` against `https://api.github.com/repos/royvillasana/VortSpec/releases/latest`, a dotted-numeric `compareVersions()`, and a total-catch that degrades to "no update" on any failure. It is exposed as `system:checkUpdate` in the zod-typed `ipcContract`, bridged through `packages/core/src/preload/index.ts`, and consumed by exactly one caller: `apps/desktop/src/renderer/src/App.tsx`, which renders a locally-defined `UpdateBanner`.

`apps/desktop` is the cockpit shell. Since 2026-08-02 we build and release **only** `apps/ide`. So the shipped app has no update check at all, and the one that has it is never installed.

Two constraints shape everything below:

1. **Ad-hoc signing is a standing decision.** `security find-identity -v -p codesigning` reports no Developer ID. macOS auto-update through Squirrel.Mac/`electron-updater` requires a valid Developer ID signature and a `latest-mac.yml` + ZIP feed that our release job does not produce. Auto-install is not merely unbuilt — it is unavailable. Notify-and-link is the only honest design.
2. **The renderer cannot make this request.** The check must stay in the main process: it needs `app.getVersion()` and `process.arch`, and going through `ipcContract` keeps the response zod-validated at the boundary like every other channel.

One live defect is in scope. `dmgUrl()` returns the **first** asset whose name ends in `.dmg`. Verified against the published v0.1.35 payload, the API returns `VortSpec-IDE-mac-arm64.dmg` at index 0 and `VortSpec-IDE-mac-intel.dmg` at index 1, so **every Intel user is currently offered an Apple Silicon DMG.** That path has never shipped to a user only because the shell containing it is not released.

## Goals / Non-Goals

**Goals:**

- The shipped IDE tells a user, unprompted, that a newer version exists.
- The message lands on the initial screen — the one surface every user passes through.
- Settings exposes the running version and an on-demand check with honest, distinct states.
- The download a user is handed actually runs on their machine.
- One `UpdateBanner`, shared, rather than a second copy in the IDE.
- Being offline is invisible: no error, no delay, no blocked startup.

**Non-Goals:**

- Automatic download, staging, or installation. Blocked by signing; out of scope until a Developer ID exists.
- Delta/differential updates, update channels (beta/stable), or rollback.
- Notifying about updates to anything other than the app itself (the SDD-DE toolkit, Claude CLI, and Figma MCP have their own paths).
- Changing the release/publish pipeline. This consumes the existing GitHub Releases feed as-is.

## Decisions

### D1. Keep the GitHub Releases API; do not adopt electron-updater

`/releases/latest` already excludes drafts and pre-releases, needs no auth, and is the same feed the landing page's download links resolve against — so the app and the website can never disagree about what "latest" is. `electron-updater` would add a dependency whose central feature (background install) is unusable while ad-hoc signed, and would require publishing a `latest-mac.yml` + ZIP alongside the DMGs.

*Alternative considered:* a static `version.json` on the GitHub Pages site. Rejected — it is a second source of truth that must be updated in lockstep with the release, and we already have a release step that forgets things (the changelog needed a dedicated memory note).

**Revisit when** a Developer ID certificate exists; at that point `electron-updater` replaces the checker and this spec's notify-only requirement is amended rather than worked around.

### D2. Architecture-matched asset selection, with the release page as fallback

Replace the first-match `dmgUrl()` with a selector keyed on `process.arch`: `arm64` → an asset whose name marks it arm64; `x64` → an asset marked Intel/x64. Match on the asset **name**, since that is the only architecture signal the API gives, and the distribution names are fixed by the release process (`VortSpec-IDE-mac-arm64.dmg`, `VortSpec-IDE-mac-intel.dmg`).

Name-matching is brittle by nature, so it fails **safe**: if nothing matches, `downloadUrl` is null and the UI offers the release page, where the user picks correctly themselves. Handing over a wrong-architecture DMG is worse than one extra click.

`UpdateInfo` carries the resolved `downloadArch` so the UI can label the button and a test can assert which asset was chosen without reaching into the picker.

### D3. Throttle in the main process, persisted next to the profile

The unauthenticated GitHub limit is 60 requests/hour/IP — generous for one check per launch, but shared with every other tool on the user's machine hitting the same API, and a relaunch loop during development would burn it.

`checkForUpdate({ force })`: without `force`, a persisted result newer than the throttle interval is returned as-is and no request is made; with `force`, always live. The launch check passes `force: false`; the Settings button passes `force: true`, because a user who clicks "Check for updates" and gets a cached answer has been lied to.

State persists as JSON in `app.getPath("userData")`, alongside `profile.json` — the established pattern in `packages/core/src/main/settings/profile-manager.ts`. It holds the last result, the timestamp, and the dismissed version. A corrupt or missing file is treated as "never checked", never as an error.

**Interval: 4 hours.** Long enough that normal use makes at most a handful of calls a day; short enough that a user who leaves the app open across a release still learns about it within an afternoon.

*Alternative considered:* an in-memory throttle. Rejected — it does nothing about the relaunch case, which is the one that actually spends requests.

### D4. Dismissal is keyed to the version, and only suppresses the prompt

Storing a boolean would silence the prompt permanently after one dismissal. Storing the dismissed *version string* means the suppression expires naturally when something newer ships, which is the only condition under which we have anything new to say.

Dismissal binds to the **prompt**, not the capability: the Settings section always reports the true state. A user who dismissed the banner and later wonders "am I current?" gets a straight answer.

### D5. `UpdateBanner` moves to `@vortspec/ui`, presentational only — and `apps/desktop` is not wired up

**Decided: the IDE is the only shell. No further investment in `apps/desktop`.**

The banner still has to move. `Profile.tsx` — the Settings view that needs it — already lives in `packages/ui/src/views/`, so the component belongs there regardless of what happens to the cockpit. Lift the private `UpdateBanner` out of `apps/desktop/src/renderer/src/App.tsx` into `packages/ui/src/views/`. It takes `info` plus `onDownload` / `onNotes` / `onDismiss` and owns no fetching, no persistence, and no `api` calls — so it renders in component tests from a plain object with no IPC mock. The IDE's initial screen and the Settings section compose it.

`apps/desktop` gets the **minimum to keep the workspace compiling**, and nothing more: its local `UpdateBanner` is deleted and its one call site points at the shared component. No new update behaviour is wired into it, its launch check is left exactly as it is, and it gets no share of the CT coverage. This is strictly cheaper than maintaining a second copy — deleting duplicated code is not an investment in the shell.

**Follow-up, deliberately not in this change:** if the cockpit is finished, it should be *deleted* rather than left compiling forever — which also ends the lockstep version bump the release flow performs on `apps/desktop/package.json` every release. That is a separate change with its own blast radius (`packages/core` and `packages/ui` are shared, and the desktop CT suites cover code the IDE uses), and it should not ride along with an update checker.

Per the project's styling rules it is a CVA + `cn()` component with tokens only, and `forwardRef` with `className` last.

### D6. The launch check always runs — no toggle, no flag

**Decided: not defeatable.** No Settings toggle, no `--no-update-check`. An update notice is only worth building if it reaches everyone, and a switch that suppresses it mostly gets flipped by accident and then silently strands that user on an old build — the exact failure this change exists to end.

The cost is that the app makes one outbound request per launch window with no way to decline. That is accepted deliberately: the request is unauthenticated, read-only, carries no identifiers beyond a `User-Agent`, and is disclosed in the Settings section rather than hidden. If a privacy control is ever wanted, it belongs to a single app-wide network/telemetry setting covering every outbound call, not a one-off switch on this feature.

### D7. The launch check is fire-and-forget, after first paint

The IDE's `App.tsx` fires the check in an effect and sets state when it resolves. Nothing awaits it, nothing gates the initial screen on it, and the banner mounts late. That is deliberate: an update notice is never worth a slower launch, and the spec asserts the initial screen is interactive while the request is in flight.

### D8. Settings states are four, and distinct

`idle` (version shown, never checked this session) · `checking` (control disabled) · `result` (up to date, naming the version checked against) · `unreachable`. The existing `UpdateInfo` collapses the last two — `latest: null, hasUpdate: false` means *both* "offline" and, in principle, "no releases exist". Add an explicit reachability signal so Settings can tell the user the truth instead of a reassuring "you're up to date" that was never verified. This is the change that makes `updateInfoSchema` grow rather than being reused as-is.

## Risks / Trade-offs

**Asset names drift and every user is silently sent to the release page** → The names are fixed by the release step and asserted in that flow; the fallback is a working path, not a dead end. A test pins the selector against a recorded v0.1.35 payload, so a rename fails CI rather than degrading in the field.

**GitHub rate limiting returns 403 and the check reports "unreachable" forever** → Distinguishable in the response and throttled by D3; the worst case is the user sees "could not reach GitHub" and a manual retry, never a false "up to date".

**An outbound request at launch is a privacy surface, and per D6 there is no way to decline it** → Unauthenticated, read-only, no request body, no identifiers beyond a `User-Agent`; the same request `apps/desktop` already made. Disclosed in the Settings section so it is visible rather than hidden. Accepted knowingly: a future opt-out belongs to one app-wide network setting, not a switch on this feature.

**Notify-only reads as unfinished next to apps that self-update** → Mitigated by copy that is explicit about the DMG step rather than implying an in-app install, and by the release notes already telling users to right-click → Open on an unsigned build. The honest fix is a Developer ID; this design is structured so that swapping in `electron-updater` touches the checker and one requirement, not the UI.

**A pre-release tag published by mistake reaches every user as an update** → `/releases/latest` excludes pre-releases and drafts by definition, so this requires publishing a bad *stable* release, which the DMG flow already guards.

## Migration Plan

Additive; nothing to migrate. `apps/desktop` swaps its private banner for the shared one purely so the workspace still type-checks. No persisted state exists yet, so the first launch after the update writes a fresh file and treats absence as "never checked". Rollback is reverting the change — the checker returning to its current unused state harms nothing.

The user-visible payoff arrives one release late by construction: v0.1.36 is the first build that can *tell* anyone about v0.1.37. Users on v0.1.35 and earlier will still never be notified, so the landing page stays the discovery path for them.

## Open Questions

- **4 hours for the throttle** is a judgement call, not a measured one. If it proves wrong, it is one constant.

Resolved before implementation: the launch check is **not** defeatable (D6), and `apps/desktop` receives only the compile-preserving edit (D5).
