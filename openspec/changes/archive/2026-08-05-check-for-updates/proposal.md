## Why

VortSpec IDE ships as a DMG from GitHub Releases and has **no way to tell a running copy that it is out of date**. Once installed, a build stays on whatever version it was on forever; there is no in-app signal, so the only way a user learns about v0.1.35 is by visiting the landing page on their own initiative. Every fix we ship reaches only the users who happen to go looking.

An update *checker* already exists in `@vortspec/core` and is wired into `apps/desktop` — the cockpit shell that, as of 2026-08-02, **we no longer build or release**. The capability is written, tested against nothing, and reaches no user. This change points it at the shell that actually ships.

## What Changes

- **The IDE checks for a newer release on launch.** `apps/ide` calls the existing `system:checkUpdate` channel once at startup — non-blocking, offline-tolerant, and silent when up to date.
- **The initial screen surfaces the update.** When a newer version exists, the IDE's first screen (the workspace picker) shows an update prompt with the new version number, a **Download** action, and a **What's new** link to the release notes. This is the screen every user sees before opening a workspace, so the message cannot be missed.
- **Settings gains a "Software update" section.** The Profile/Settings view gets the running version, the latest known version, a manual **Check for updates** control with explicit states (checking / up to date / update available / could not reach GitHub), and the same Download and What's new actions.
- **`UpdateBanner` moves into `@vortspec/ui`.** It currently lives as a private function inside `apps/desktop/src/renderer/src/App.tsx`, but the Settings view that needs it (`Profile.tsx`) already lives in `packages/ui`. The IDE's initial screen and the Settings section render the same component.
- **`apps/desktop` gets the compile-preserving edit and nothing else.** The IDE is the only shell being launched from now on. The cockpit's local banner is deleted and its call site points at the shared component so the workspace still type-checks; no update behaviour is wired into it and it gets no test coverage here. Deleting the shell outright is a separate change.
- **Fix: the download link ignores the user's CPU.** `dmgUrl()` returns the *first* `.dmg` asset in the release payload. Verified against the live v0.1.35 release, that is always `VortSpec-IDE-mac-arm64.dmg` — so an **Intel user is handed an Apple Silicon DMG that will not run**. Asset selection becomes architecture-aware, with the release page as the fallback when no matching asset exists.
- **Dismissal is remembered per version.** Dismissing the prompt suppresses it for that version only; the next release surfaces it again. Without this, "notify on every launch" is indistinguishable from nagging.
- **The check is throttled and cached.** At most one network check per interval, with the last result persisted, so relaunch loops cannot burn the unauthenticated GitHub rate limit (60 req/hr/IP). The manual control in Settings always bypasses the throttle.

The check is **not** defeatable — no Settings toggle and no `--no-update-check` flag. A notice is only worth building if it reaches everyone, and a switch that suppresses it mostly gets flipped by accident and then silently strands that user on an old build.

Explicitly **not** in scope: automatic download-and-install. macOS auto-update via Squirrel/electron-updater requires a Developer ID signature, and these builds are ad-hoc signed by an accepted, standing decision. This change is notify-and-link; the user installs the DMG themselves.

## Capabilities

### New Capabilities
- `app-updates`: detecting that a newer release exists, and how the running app tells the user — launch check, throttling and caching, per-version dismissal, architecture-correct download target, and offline behaviour.

### Modified Capabilities
- `ide-shell`: the initial screen gains a requirement to surface an available update.
- `profile`: the Settings view gains a requirement for a software-update section with a manual check.

## Impact

| Area | Change |
|---|---|
| `packages/core/src/main/update/update-checker.ts` | architecture-aware asset pick; throttle + cached result |
| `packages/core/src/shared/update.ts` | `UpdateInfo` gains the fields the UI needs (checked-at, asset arch) |
| `packages/core/src/shared/ipc.ts` | `system:checkUpdate` gains a force flag; new channel for dismissal state |
| `packages/ui/src/views/` | new shared `UpdateBanner`; `Profile.tsx` gains the update section |
| `apps/ide/src/renderer/src/App.tsx` | launch check + banner on the workspace picker |
| `apps/desktop/src/renderer/src/App.tsx` | drops its private `UpdateBanner` for the shared one — compile-preserving only |
| Tests | CT coverage in `apps/ide/tests/ct`; the IDE's mock API gains `checkUpdate` |

No new runtime dependencies. One outbound HTTP request to `api.github.com`, unauthenticated and read-only — the same request `apps/desktop` already makes.
