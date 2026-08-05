# app-updates Specification

## Purpose
How a running VortSpec IDE learns that a newer release exists, and how it tells the user.

Two constraints shape every requirement below and are not incidental:

- **Notify-and-link, never auto-install.** macOS auto-update via Squirrel/electron-updater
  requires a Developer ID signature; these builds are ad-hoc signed by a standing
  decision, so background install is unavailable rather than merely unbuilt. This is
  stated normatively in "Updates are notify-and-link, never auto-installed".
- **The check is not defeatable.** There is deliberately no setting or flag to suppress
  it: a notice is only worth building if it reaches everyone, and a switch that
  suppresses it mostly gets flipped by accident and then silently strands that user on
  an old build. The cost — one unauthenticated outbound request per throttle window
  that the user cannot decline — is accepted knowingly and disclosed in the Settings
  software-update section rather than hidden.

## Requirements
### Requirement: The running app detects a newer published release

The app SHALL determine whether a release newer than the running version exists by querying the project's public GitHub Releases endpoint for the latest release, comparing the release tag to the running app version. Draft and pre-release releases SHALL be excluded. The comparison SHALL be numeric per dotted segment, tolerant of a leading `v` on the tag.

#### Scenario: A newer release exists

- **WHEN** the running version is `0.1.34` and the latest published release is tagged `v0.1.35`
- **THEN** the check reports an available update with latest version `0.1.35`

#### Scenario: The app is current

- **WHEN** the running version equals the latest published release version
- **THEN** the check reports no available update

#### Scenario: The running build is ahead of the latest release

- **WHEN** the running version is `0.1.36` and the latest published release is `0.1.35`
- **THEN** the check reports no available update, and never offers a downgrade

### Requirement: A failed check is silent and non-blocking

The check SHALL never block app startup, never surface an error dialog, and never throw into the renderer. Any failure — offline, DNS failure, timeout, HTTP non-200, rate limiting, or a malformed payload — SHALL be reported as "no update available" while remaining distinguishable from a successful "up to date" result for display purposes.

#### Scenario: The machine is offline

- **WHEN** the update check runs with no network connectivity
- **THEN** startup completes normally, no error is shown, and the result is reported as unreachable rather than up to date

#### Scenario: The request hangs

- **WHEN** the GitHub endpoint does not respond within the request timeout
- **THEN** the request is aborted and the check resolves as unreachable

#### Scenario: The response is not valid JSON

- **WHEN** the endpoint returns a body that cannot be parsed
- **THEN** the check resolves as unreachable and does not throw

### Requirement: The download target matches the user's CPU architecture

When offering a download, the app SHALL select the release asset matching the running machine's CPU architecture. When no asset matches that architecture, the app SHALL fall back to the release page rather than offering an asset that cannot run.

#### Scenario: Apple Silicon

- **WHEN** the app runs on `arm64` and the release contains both an arm64 and an Intel DMG
- **THEN** the offered download is the arm64 DMG

#### Scenario: Intel

- **WHEN** the app runs on `x64` and the release contains both an arm64 and an Intel DMG
- **THEN** the offered download is the Intel DMG, not the arm64 one

#### Scenario: No asset matches

- **WHEN** the release contains no DMG matching the running architecture
- **THEN** the offered target is the release page URL

### Requirement: Automatic checks are throttled and their result cached

The app SHALL perform at most one automatic network check per throttle interval, persisting the last result across restarts and serving the cached result within the interval. A user-initiated check SHALL always bypass the throttle and perform a live request.

#### Scenario: Rapid relaunch

- **WHEN** the app is launched again within the throttle interval of a previous automatic check
- **THEN** no network request is made and the cached result is used

#### Scenario: Interval elapsed

- **WHEN** the app is launched after the throttle interval has elapsed
- **THEN** a fresh network check is performed and the cached result replaced

#### Scenario: User asks explicitly

- **WHEN** the user activates the manual check control within the throttle interval
- **THEN** a live network request is performed regardless of the cache

### Requirement: Dismissal is remembered per version

Dismissing the update prompt SHALL suppress that prompt for the dismissed version only, persisting across restarts. A release newer than the dismissed version SHALL surface the prompt again.

#### Scenario: Dismiss and relaunch

- **WHEN** the user dismisses the prompt for `0.1.35` and relaunches the app while `0.1.35` is still latest
- **THEN** the prompt is not shown

#### Scenario: A newer release arrives after dismissal

- **WHEN** the user has dismissed `0.1.35` and `0.1.36` is subsequently published
- **THEN** the prompt is shown again for `0.1.36`

#### Scenario: Dismissal never hides the Settings section

- **WHEN** the user has dismissed the prompt for the current latest version
- **THEN** the Settings software-update section still reports that an update is available

### Requirement: Updates are notify-and-link, never auto-installed

The app SHALL NOT download, stage, or install an update automatically. Activating the download action SHALL open the target in the user's browser and leave installation to the user.

#### Scenario: Download is user-initiated

- **WHEN** an update is available and the user activates Download
- **THEN** the architecture-matched target opens in the external browser and no file is written by the app

#### Scenario: Nothing is installed silently

- **WHEN** an update is available and the user takes no action
- **THEN** the running app is unmodified on disk and continues on its current version
