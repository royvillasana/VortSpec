# Code signing + notarization (VortSpec IDE, macOS)

The build is configured for a Developer-ID-signed + notarized DMG, but it ships
**ad-hoc-signed** until you provide a certificate. Ad-hoc means the app is valid
(not "damaged") but unsigned — macOS shows "unidentified developer" on first open
(right-click → **Open**). To ship a clean, warning-free download for everyone,
sign + notarize:

## One-time setup

1. **Apple Developer account** ($99/yr) → https://developer.apple.com/account
2. Create a **Developer ID Application** certificate (Certificates → +) and install
   it in your login keychain (double-click the downloaded `.cer`, or import a
   `.p12`). Verify: `security find-identity -v -p codesigning` shows
   `"Developer ID Application: <you> (TEAMID)"`.
3. Create an **app-specific password** for notarization at
   https://account.apple.com → Sign-In and Security → App-Specific Passwords.
4. Find your **Team ID**: https://developer.apple.com/account → Membership.

## Building a signed + notarized DMG

Set `notarize` to `{ "teamId": "YOURTEAMID" }` in `apps/ide/package.json` →
`build.mac` (or leave `false` to sign without notarizing), then:

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="YOURTEAMID"
# The Developer ID cert must be in the keychain, OR point to a .p12:
#   export CSC_LINK="/path/to/DeveloperID.p12"; export CSC_KEY_PASSWORD="…"
pnpm --filter @vortspec/ide dist
```

electron-builder auto-detects the "Developer ID Application" identity, signs with
the hardened runtime + `build/entitlements.mac.plist`, and (when `notarize` is set)
staples the notarization ticket. `build/after-pack.cjs` ad-hoc-signs after editing
`Info.plist`; a real Developer ID sign then overrides it.

Then re-upload the two DMGs (see [release-and-dmg-workflow] / the memory note):
`gh release upload v0.1.21 apps/ide/release/VortSpec-IDE-mac-*.dmg --clobber --repo royvillasana/VortSpec`.

## What the entitlements are for

Electron/V8 need JIT + writable-executable memory; the app spawns the user's own
`claude`/`git`/dev servers (inherit + unsigned-exec); library validation is off so
Electron's own unsigned dylibs load. See `entitlements.mac.plist`.
