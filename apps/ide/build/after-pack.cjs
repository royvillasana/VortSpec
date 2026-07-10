const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

/**
 * Strip permission declarations the IDE never uses from the packaged app's
 * Info.plist. Electron ships Camera / Microphone / Bluetooth usage strings by
 * default; a code IDE has no reason to advertise them. They don't trigger a
 * prompt on their own (only calling the API does), but removing them keeps the
 * app's declared permission surface honest.
 *
 * Runs before code-signing (electron-builder order: pack -> afterPack -> sign),
 * so the signature seals the edited plist. Fires for each arch's temp dir in a
 * universal build; editing both identically keeps @electron/universal's plist
 * parity check happy.
 */
const REMOVE = [
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
];

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const plist = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Info.plist",
  );
  for (const key of REMOVE) {
    try {
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, plist], { stdio: "ignore" });
    } catch {
      // Key already absent (e.g. re-run, or a helper app) — nothing to remove.
    }
  }
};
