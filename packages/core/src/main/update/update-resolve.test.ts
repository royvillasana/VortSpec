import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareVersions,
  isFresh,
  pickAsset,
  resolveUpdateInfo,
  toUpdateArch,
  THROTTLE_MS,
} from "./update-resolve";

/**
 * The payload is the REAL `/releases/latest` response for v0.1.35, recorded
 * from the live API — not a hand-written stand-in. That matters for the asset
 * test below: the bug being fixed here was invisible against an invented
 * fixture because it depended on the order GitHub actually returns assets in
 * (arm64 at index 0), which is the thing an invented fixture would get to
 * choose for itself.
 *
 * `fileURLToPath`, not `.pathname` — a file URL percent-encodes its path, and
 * this checkout lives under a directory with a space in it.
 */
const FIXTURE = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "__fixtures__/releases-latest-v0.1.35.json",
);
const release = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;

describe("the recorded fixture is the shape the code claims", () => {
  it("is a published, non-draft release carrying both DMGs, arm64 first", () => {
    expect(release.tag_name).toBe("v0.1.35");
    expect(release.draft).toBe(false);
    expect(release.prerelease).toBe(false);
    const names = (release.assets as { name: string }[]).map((a) => a.name);
    expect(names).toEqual(["VortSpec-IDE-mac-arm64.dmg", "VortSpec-IDE-mac-intel.dmg"]);
  });
});

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.1.2", "0.1.10")).toBe(-1); // numeric, not lexical
  });

  it("treats equal versions as 0 and tolerates a leading v", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("v0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.2.0", "v0.1.0")).toBe(1);
  });

  it("ignores pre-release suffixes and missing segments", () => {
    expect(compareVersions("0.2.0-beta.1", "0.1.0")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  it("never reports an update when the running build is AHEAD of the release", () => {
    // A dev build past the last tag must not be offered a downgrade.
    expect(compareVersions("0.1.35", "0.1.36")).toBe(-1);
  });
});

describe("pickAsset — the architecture the user actually runs", () => {
  it("gives Apple Silicon the arm64 DMG", () => {
    expect(pickAsset(release.assets, "arm64")?.name).toBe("VortSpec-IDE-mac-arm64.dmg");
  });

  it("gives Intel the intel DMG, NOT the arm64 one that happens to come first", () => {
    // The regression this whole change exists to prevent: the previous
    // selector returned the first .dmg in the payload, which is arm64, so an
    // Intel user was handed a build their machine cannot launch.
    expect(pickAsset(release.assets, "x64")?.name).toBe("VortSpec-IDE-mac-intel.dmg");
  });

  it("returns null rather than a wrong-architecture download", () => {
    const armOnly = [
      { name: "VortSpec-IDE-mac-arm64.dmg", browser_download_url: "https://example/arm.dmg" },
    ];
    expect(pickAsset(armOnly, "x64")).toBeNull();
  });

  it("returns null on an unpublished architecture, and on junk", () => {
    expect(pickAsset(release.assets, null)).toBeNull();
    expect(pickAsset(undefined, "arm64")).toBeNull();
    expect(pickAsset([{ nope: true }, null, "string"], "arm64")).toBeNull();
  });

  it("ignores non-DMG assets carrying the same marker", () => {
    const assets = [
      { name: "VortSpec-IDE-mac-arm64.dmg.blockmap", browser_download_url: "https://example/bm" },
      { name: "VortSpec-IDE-mac-arm64.dmg", browser_download_url: "https://example/arm.dmg" },
    ];
    expect(pickAsset(assets, "arm64")?.browser_download_url).toBe("https://example/arm.dmg");
  });

  it("will not let a dual-arch name satisfy both architectures", () => {
    const both = [
      { name: "VortSpec-IDE-mac-intel-and-arm64.dmg", browser_download_url: "https://example/x" },
    ];
    expect(pickAsset(both, "arm64")).toBeNull();
    expect(pickAsset(both, "x64")).toBeNull();
  });
});

describe("toUpdateArch", () => {
  it("maps the two architectures we publish, and nothing else", () => {
    expect(toUpdateArch("arm64")).toBe("arm64");
    expect(toUpdateArch("x64")).toBe("x64");
    expect(toUpdateArch("ia32")).toBeNull();
    expect(toUpdateArch("")).toBeNull();
  });
});

describe("resolveUpdateInfo", () => {
  const at = 1_700_000_000_000;

  it("reports an available update, reachable, with the arm64 download", () => {
    const info = resolveUpdateInfo(release, { current: "0.1.34", arch: "arm64", checkedAt: at })!;
    expect(info.latest).toBe("0.1.35");
    expect(info.hasUpdate).toBe(true);
    expect(info.reachable).toBe(true);
    expect(info.downloadArch).toBe("arm64");
    expect(info.downloadUrl).toContain("arm64.dmg");
    expect(info.releaseUrl).toBe("https://github.com/royvillasana/VortSpec/releases/tag/v0.1.35");
    expect(info.checkedAt).toBe(at);
  });

  it("reports no update when current, but still reachable", () => {
    const info = resolveUpdateInfo(release, { current: "0.1.35", arch: "x64", checkedAt: at })!;
    expect(info.hasUpdate).toBe(false);
    expect(info.reachable).toBe(true);
    expect(info.latest).toBe("0.1.35");
  });

  it("reports no update when the running build is ahead", () => {
    const info = resolveUpdateInfo(release, { current: "0.1.36", arch: "arm64", checkedAt: at })!;
    expect(info.hasUpdate).toBe(false);
  });

  it("falls back to the release page when no asset matches the arch", () => {
    const info = resolveUpdateInfo(
      { tag_name: "v9.9.9", html_url: "https://example/rel", assets: [] },
      { current: "0.1.35", arch: "arm64", checkedAt: at },
    )!;
    expect(info.hasUpdate).toBe(true);
    expect(info.downloadUrl).toBeNull();
    expect(info.downloadArch).toBeNull();
    expect(info.releaseUrl).toBe("https://example/rel");
  });

  it("returns null for a payload with no usable tag, rather than inventing one", () => {
    expect(resolveUpdateInfo({}, { current: "0.1.0", arch: "arm64", checkedAt: at })).toBeNull();
    expect(resolveUpdateInfo(null, { current: "0.1.0", arch: "arm64", checkedAt: at })).toBeNull();
    expect(
      resolveUpdateInfo("not an object", { current: "0.1.0", arch: "arm64", checkedAt: at }),
    ).toBeNull();
  });
});

describe("isFresh", () => {
  const now = 1_700_000_000_000;

  it("is fresh inside the window and stale outside it", () => {
    expect(isFresh(now - 1000, now)).toBe(true);
    expect(isFresh(now - (THROTTLE_MS - 1), now)).toBe(true);
    expect(isFresh(now - THROTTLE_MS, now)).toBe(false);
    expect(isFresh(now - THROTTLE_MS * 2, now)).toBe(false);
  });

  it("is never fresh when there is no previous check", () => {
    expect(isFresh(null, now)).toBe(false);
  });

  it("treats a future timestamp as stale rather than pinning the cache forever", () => {
    expect(isFresh(now + 60_000, now)).toBe(false);
  });
});
