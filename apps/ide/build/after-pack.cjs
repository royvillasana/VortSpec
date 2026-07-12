const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

/**
 * Strip permission declarations the IDE never uses from the packaged app's
 * Info.plist. Electron ships Camera / Microphone / Bluetooth usage strings by
 * default; a code IDE has no reason to advertise them. They don't trigger a
 * prompt on their own (only calling the API does), but removing them keeps the
 * app's declared permission surface honest.
 *
 * Editing Info.plist AFTER Electron's prebuilt binary is ad-hoc-signed invalidates
 * that signature. When a real Developer ID cert is present, electron-builder's own
 * signing step (which runs after afterPack) re-seals it — fine. But when signing is
 * SKIPPED (no cert), nothing re-seals it, and macOS reports the arm64 app as
 * "damaged" (a broken signature reads worse than an unsigned one). So we re-apply an
 * ad-hoc signature here; if Developer ID signing follows, `--force` lets it override.
 */
const REMOVE = [
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
];

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const plist = join(app, "Contents", "Info.plist");
  for (const key of REMOVE) {
    try {
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, plist], { stdio: "ignore" });
    } catch {
      // Key already absent (e.g. re-run, or a helper app) — nothing to remove.
    }
  }
  // Re-seal an ad-hoc signature so the edited bundle is valid (not "damaged").
  // Sign nested code inside-out via --deep; a later Developer ID sign overrides it.
  try {
    execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
  } catch (err) {
    console.warn(`[after-pack] ad-hoc re-sign failed for ${app}: ${err.message}`);
  }
};
