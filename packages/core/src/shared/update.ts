import { z } from "zod";

/**
 * App update check. VortSpec is distributed as GitHub releases; on launch the
 * main process asks the GitHub API for the latest release and compares versions.
 * This is a *check* only — the app is ad-hoc signed (not notarized), so it can't
 * auto-install macOS updates yet; the user downloads the new .dmg. When the app
 * is Apple-signed, this can be swapped for electron-updater's background install.
 */
export const updateInfoSchema = z.object({
  /** The running app version (e.g. "0.1.0"). */
  current: z.string(),
  /** The latest released version, or null if the check couldn't reach GitHub. */
  latest: z.string().nullable(),
  /** True when `latest` is newer than `current`. */
  hasUpdate: z.boolean(),
  /** The release page URL (for "What's new"). */
  releaseUrl: z.string().nullable(),
  /** Direct download URL of the macOS .dmg asset, if present. */
  downloadUrl: z.string().nullable(),
});
export type UpdateInfo = z.infer<typeof updateInfoSchema>;
