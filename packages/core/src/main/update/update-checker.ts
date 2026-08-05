import { app } from "electron";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import type { UpdateInfo, UpdateDismissal } from "@vortspec/core/update";
import { updateInfoSchema } from "@vortspec/core/update";
import {
  compareVersions,
  isFresh,
  resolveUpdateInfo,
  toUpdateArch,
  unreachableInfo,
} from "./update-resolve";

export { pickAsset, THROTTLE_MS } from "./update-resolve";
export { compareVersions };

/**
 * Update check against GitHub Releases. Read-only, no auth (public repo), and
 * fully tolerant of being offline — a failed check reports "unreachable", which
 * the UI must not render as "up to date".
 *
 * A check, not an installer: it surfaces a newer release so the user can
 * download it. The build is ad-hoc signed, so macOS cannot auto-install an
 * update at all; that is a signing constraint, not an unfinished feature.
 *
 * The check is NOT defeatable — there is deliberately no setting or flag to
 * suppress it. A notice is only worth building if it reaches everyone.
 */

const REPO = "royvillasana/VortSpec";
const LATEST_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;
const TIMEOUT_MS = 8000;

const stateSchema = z.object({
  last: updateInfoSchema.nullable(),
  dismissedVersion: z.string().nullable(),
});
type UpdateState = z.infer<typeof stateSchema>;

const EMPTY_STATE: UpdateState = { last: null, dismissedVersion: null };

/**
 * Seams for tests. The default environment reaches electron, the network and
 * the filesystem; a test supplies its own so the throttle and the failure modes
 * can be exercised without a running app. Electron is touched lazily inside the
 * functions, never at import time, so importing this module stays safe outside
 * an Electron runtime.
 */
export interface UpdateEnv {
  currentVersion: () => string;
  arch: () => string;
  now: () => number;
  readState: () => Promise<UpdateState>;
  writeState: (state: UpdateState) => Promise<void>;
  fetchLatest: (signal: AbortSignal) => Promise<unknown>;
}

function statePath(): string {
  return join(app.getPath("userData"), "update-state.json");
}

/** Read-with-default: a missing or corrupt file means "never checked", never an error. */
async function readStateFile(): Promise<UpdateState> {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(await readFile(statePath(), "utf8")));
    return parsed.success ? parsed.data : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

async function writeStateFile(state: UpdateState): Promise<void> {
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(statePath(), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Persisting is best-effort. Losing the cache costs one extra request; it
    // must never turn an update check into a visible failure.
  }
}

/** Throws on any non-200 or unparseable body — the caller treats that as unreachable. */
async function fetchLatestRelease(signal: AbortSignal): Promise<unknown> {
  const res = await fetch(LATEST_RELEASE, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "VortSpec" },
    signal,
  });
  // 404 = no release published yet; 403 = rate limited. Both are "we did not
  // find out", not "you are current".
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  return res.json();
}

const defaultEnv: UpdateEnv = {
  currentVersion: () => app.getVersion(),
  arch: () => process.arch,
  now: () => Date.now(),
  readState: readStateFile,
  writeState: writeStateFile,
  fetchLatest: fetchLatestRelease,
};

/**
 * Check for a newer release.
 *
 * `force: false` (the launch check) reuses a cached result inside the throttle
 * window, so a relaunch loop cannot burn the unauthenticated GitHub rate limit.
 * `force: true` (the Settings button) always goes to the network — answering a
 * user's explicit "check now" from cache would be telling them something untrue.
 */
export async function checkForUpdate(
  req: { force: boolean },
  overrides: Partial<UpdateEnv> = {},
): Promise<UpdateInfo> {
  // Partial, so a caller overriding one seam (say, the running version) still
  // gets the real network path for the rest.
  const env: UpdateEnv = { ...defaultEnv, ...overrides };
  const current = env.currentVersion();
  const state = await env.readState();

  if (!req.force && state.last && isFresh(state.last.checkedAt, env.now())) {
    // Serve the cache, but re-stamp `current`: the running version can change
    // under a cached result (the user installed the update), and a stale
    // `current` would keep claiming an update that is already applied.
    return { ...state.last, current, hasUpdate: hasUpdateAgainst(state.last.latest, current) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const payload = await env.fetchLatest(controller.signal);
    const info = resolveUpdateInfo(payload, {
      current,
      arch: toUpdateArch(env.arch()),
      checkedAt: env.now(),
    });
    if (!info) return unreachableInfo(current, state.last?.checkedAt ?? null);
    await env.writeState({ ...state, last: info });
    return info;
  } catch {
    // Offline, DNS failure, abort, non-200, malformed body — all the same to the
    // user, and none of them may throw into the renderer or block startup.
    return unreachableInfo(current, state.last?.checkedAt ?? null);
  } finally {
    clearTimeout(timer);
  }
}

function hasUpdateAgainst(latest: string | null, current: string): boolean {
  if (!latest) return false;
  return compareVersions(latest, current) > 0;
}

/** The version whose update prompt the user dismissed, if any. */
export async function readDismissal(
  overrides: Partial<UpdateEnv> = {},
): Promise<UpdateDismissal> {
  const env: UpdateEnv = { ...defaultEnv, ...overrides };
  const state = await env.readState();
  return { dismissedVersion: state.dismissedVersion };
}

/**
 * Suppress the prompt for one version only. Keyed by version rather than a
 * boolean so the suppression expires by itself when something newer ships.
 */
export async function dismissVersion(
  version: string,
  overrides: Partial<UpdateEnv> = {},
): Promise<UpdateDismissal> {
  const env: UpdateEnv = { ...defaultEnv, ...overrides };
  const state = await env.readState();
  const next: UpdateState = { ...state, dismissedVersion: version };
  await env.writeState(next);
  return { dismissedVersion: version };
}
