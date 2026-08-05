import type { UpdateArch, UpdateInfo } from "@vortspec/core/update";

/**
 * The pure half of the update check: version ordering, asset selection, and
 * turning a GitHub release payload into an `UpdateInfo`.
 *
 * Deliberately free of `electron` and `fetch` imports. `update-checker.ts` owns
 * the network call and the userData store; everything decidable without I/O
 * lives here so it can be tested against a recorded release payload rather than
 * a mock of the whole main process.
 */

/** Compare dotted numeric versions. >0 if a>b, <0 if a<b, 0 if equal. Pre-release suffixes ignored. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Architecture markers as they appear in our published asset names
 * (`VortSpec-IDE-mac-arm64.dmg`, `VortSpec-IDE-mac-intel.dmg`). The asset NAME
 * is the only architecture signal the GitHub API gives us, so matching on it is
 * unavoidable — which is why an unmatched arch resolves to null and sends the
 * user to the release page, instead of guessing.
 */
const ARCH_MARKERS: Record<UpdateArch, readonly string[]> = {
  arm64: ["arm64", "aarch64", "apple-silicon", "applesilicon"],
  x64: ["intel", "x64", "x86_64", "amd64"],
};

/** Node's `process.arch` → an arch we publish a DMG for, or null if we don't. */
export function toUpdateArch(nodeArch: string): UpdateArch | null {
  if (nodeArch === "arm64") return "arm64";
  if (nodeArch === "x64") return "x64";
  return null;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/** Assets from a release payload, ignoring anything malformed. */
function assetsOf(raw: unknown): ReleaseAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: ReleaseAsset[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const { name, browser_download_url: url } = a as Record<string, unknown>;
    if (typeof name === "string" && typeof url === "string") {
      out.push({ name, browser_download_url: url });
    }
  }
  return out;
}

/**
 * The DMG matching `arch`, or null. Never falls back to "some other .dmg":
 * offering an arm64 build to an Intel Mac ships a file that cannot launch, and
 * a link to the release page is strictly better than a broken download.
 */
export function pickAsset(rawAssets: unknown, arch: UpdateArch | null): ReleaseAsset | null {
  if (!arch) return null;
  const markers = ARCH_MARKERS[arch];
  const foreign = ARCH_MARKERS[arch === "arm64" ? "x64" : "arm64"];
  for (const asset of assetsOf(rawAssets)) {
    const name = asset.name.toLowerCase();
    if (!name.endsWith(".dmg")) continue;
    // Require our own marker AND the absence of the other architecture's, so a
    // hypothetical "mac-intel-and-arm64.dmg" can never satisfy both.
    if (markers.some((m) => name.includes(m)) && !foreign.some((m) => name.includes(m))) {
      return asset;
    }
  }
  return null;
}

/** The result when the check could not reach GitHub — never mistaken for "up to date". */
export function unreachableInfo(current: string, checkedAt: number | null): UpdateInfo {
  return {
    current,
    latest: null,
    hasUpdate: false,
    reachable: false,
    releaseUrl: null,
    downloadUrl: null,
    downloadArch: null,
    checkedAt,
  };
}

/**
 * A GitHub `/releases/latest` payload → `UpdateInfo`. Returns null when the
 * payload carries no usable tag, so the caller can report it as unreachable
 * rather than inventing a version.
 */
export function resolveUpdateInfo(
  payload: unknown,
  opts: { current: string; arch: UpdateArch | null; checkedAt: number },
): UpdateInfo | null {
  if (!payload || typeof payload !== "object") return null;
  const json = payload as Record<string, unknown>;
  const tag = typeof json.tag_name === "string" ? json.tag_name : null;
  if (!tag) return null;

  const latest = tag.replace(/^v/i, "");
  const asset = pickAsset(json.assets, opts.arch);
  return {
    current: opts.current,
    latest,
    hasUpdate: compareVersions(latest, opts.current) > 0,
    reachable: true,
    releaseUrl: typeof json.html_url === "string" ? json.html_url : null,
    downloadUrl: asset?.browser_download_url ?? null,
    downloadArch: asset ? opts.arch : null,
    checkedAt: opts.checkedAt,
  };
}

/** How long an automatic check's result is reused before going back to the network. */
export const THROTTLE_MS = 4 * 60 * 60 * 1000; // 4 hours

/** True when a cached result is still inside the throttle window. */
export function isFresh(checkedAt: number | null, now: number, ttl = THROTTLE_MS): boolean {
  if (checkedAt === null) return false;
  // A clock that moved backwards (or a doctored file) must not pin the cache
  // as "fresh" forever — treat any non-positive age as stale.
  const age = now - checkedAt;
  return age >= 0 && age < ttl;
}
