import { z } from "zod";

/**
 * App update check. VortSpec is distributed as GitHub releases; on launch the
 * main process asks the GitHub API for the latest release and compares versions.
 * This is a *check* only — the app is ad-hoc signed (not notarized), so it can't
 * auto-install macOS updates yet; the user downloads the new .dmg. When the app
 * is Apple-signed, this can be swapped for electron-updater's background install.
 */

/**
 * macOS CPU architectures we publish a DMG for. The download offered to a user
 * MUST match theirs — handing an arm64 DMG to an Intel Mac ships a file that
 * cannot run, which is exactly what the pick-the-first-.dmg selector used to do.
 */
export const updateArchSchema = z.enum(["arm64", "x64"]);
export type UpdateArch = z.infer<typeof updateArchSchema>;

export const updateInfoSchema = z.object({
  /** The running app version (e.g. "0.1.0"). */
  current: z.string(),
  /** The latest released version, or null if the check couldn't reach GitHub. */
  latest: z.string().nullable(),
  /** True when `latest` is newer than `current`. */
  hasUpdate: z.boolean(),
  /**
   * Whether the check actually reached GitHub and got an answer. Without this,
   * `hasUpdate: false` collapses "you are up to date" together with "we never
   * found out" — and telling an offline user they are current is a lie the UI
   * has no way to detect. Settings renders these as two distinct states.
   */
  reachable: z.boolean(),
  /** The release page URL (for "What's new"). */
  releaseUrl: z.string().nullable(),
  /**
   * Direct download URL of the DMG matching THIS machine's architecture, or
   * null when the release has no asset for it — in which case the UI sends the
   * user to `releaseUrl` to choose, rather than offering a DMG that won't run.
   */
  downloadUrl: z.string().nullable(),
  /** The architecture `downloadUrl` was resolved for; null when there is no match. */
  downloadArch: updateArchSchema.nullable(),
  /**
   * When this result was obtained, epoch ms — null when never checked. Drives
   * the throttle and lets Settings say how fresh the answer is.
   */
  checkedAt: z.number().nullable(),
});
export type UpdateInfo = z.infer<typeof updateInfoSchema>;

/** Request for a check. `force` skips the throttle — what the Settings button sends. */
export const updateCheckRequestSchema = z.object({ force: z.boolean() });
export type UpdateCheckRequest = z.infer<typeof updateCheckRequestSchema>;

/**
 * Which version the user dismissed the update prompt for. Keyed by version
 * rather than a boolean so the suppression expires by itself the moment
 * something newer ships — a boolean would silence the prompt forever.
 */
export const updateDismissalSchema = z.object({
  dismissedVersion: z.string().nullable(),
});
export type UpdateDismissal = z.infer<typeof updateDismissalSchema>;
