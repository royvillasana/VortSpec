import { app } from "electron";
import type { UpdateInfo } from "@vortspec/core/update";

/**
 * Update check against GitHub Releases. Read-only, no auth (public repo), and
 * fully tolerant of being offline — a failed check just reports "no update".
 * A check, not an installer: it surfaces a newer release so the user can
 * download it (the ad-hoc-signed build can't auto-install macOS updates yet).
 */

const REPO = "royvillasana/VortSpec";
const LATEST_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;
const TIMEOUT_MS = 8000;

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

/** Pick the macOS .dmg asset's download URL from a release payload. */
function dmgUrl(assets: unknown): string | null {
  if (!Array.isArray(assets)) return null;
  for (const a of assets) {
    const name = a && typeof a === "object" ? (a as Record<string, unknown>).name : null;
    const url = a && typeof a === "object" ? (a as Record<string, unknown>).browser_download_url : null;
    if (typeof name === "string" && name.toLowerCase().endsWith(".dmg") && typeof url === "string") {
      return url;
    }
  }
  return null;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  const offline: UpdateInfo = {
    current,
    latest: null,
    hasUpdate: false,
    releaseUrl: null,
    downloadUrl: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LATEST_RELEASE, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "VortSpec" },
      signal: controller.signal,
    });
    if (!res.ok) return offline; // e.g. 404 when no release exists yet
    const json = (await res.json()) as Record<string, unknown>;
    const tag = typeof json.tag_name === "string" ? json.tag_name : null;
    if (!tag) return offline;
    const latest = tag.replace(/^v/i, "");
    const releaseUrl = typeof json.html_url === "string" ? json.html_url : null;
    return {
      current,
      latest,
      hasUpdate: compareVersions(latest, current) > 0,
      releaseUrl,
      downloadUrl: dmgUrl(json.assets),
    };
  } catch {
    return offline; // offline / aborted / malformed — never throws to the renderer
  } finally {
    clearTimeout(timer);
  }
}
