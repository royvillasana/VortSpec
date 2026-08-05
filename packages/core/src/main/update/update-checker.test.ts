import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkForUpdate, dismissVersion, readDismissal, type UpdateEnv } from "./update-checker";
import { THROTTLE_MS } from "./update-resolve";

/**
 * Orchestration: throttle, cache, dismissal, and the failure modes that must
 * never reach the renderer. `checkForUpdate` takes an injectable `UpdateEnv`,
 * so none of this needs a running Electron app — which is the point, since the
 * module's default environment calls `app.getPath()` and the real network.
 *
 * Version ordering and asset selection are covered in update-resolve.test.ts.
 */

const release = JSON.parse(
  readFileSync(
    join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__/releases-latest-v0.1.35.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const NOW = 1_700_000_000_000;

interface Harness {
  env: UpdateEnv;
  /** How many times the network was actually hit. */
  fetches: () => number;
  state: () => { last: unknown; dismissedVersion: string | null };
}

function harness(opts: {
  current?: string;
  arch?: string;
  now?: number;
  initial?: { last: unknown; dismissedVersion: string | null };
  fetchImpl?: (signal: AbortSignal) => Promise<unknown>;
}): Harness {
  let state = opts.initial ?? { last: null, dismissedVersion: null };
  let fetches = 0;
  const env: UpdateEnv = {
    currentVersion: () => opts.current ?? "0.1.34",
    arch: () => opts.arch ?? "arm64",
    now: () => opts.now ?? NOW,
    readState: async () => state as never,
    writeState: async (next) => {
      state = next as never;
    },
    fetchLatest: async (signal) => {
      fetches += 1;
      return opts.fetchImpl ? opts.fetchImpl(signal) : release;
    },
  };
  return { env, fetches: () => fetches, state: () => state };
}

describe("checkForUpdate — a live check", () => {
  it("reports the newer release and caches it", async () => {
    const h = harness({});
    const info = await checkForUpdate({ force: false }, h.env);

    expect(info.latest).toBe("0.1.35");
    expect(info.hasUpdate).toBe(true);
    expect(info.reachable).toBe(true);
    expect(info.downloadArch).toBe("arm64");
    expect(h.fetches()).toBe(1);
    expect(h.state().last).toMatchObject({ latest: "0.1.35" });
  });

  it("hands an Intel machine the Intel DMG", async () => {
    const h = harness({ arch: "x64" });
    const info = await checkForUpdate({ force: true }, h.env);
    expect(info.downloadArch).toBe("x64");
    expect(info.downloadUrl).toContain("intel");
  });
});

describe("checkForUpdate — the throttle", () => {
  const cached = {
    current: "0.1.34",
    latest: "0.1.35",
    hasUpdate: true,
    reachable: true,
    releaseUrl: "https://example/rel",
    downloadUrl: "https://example/arm.dmg",
    downloadArch: "arm64" as const,
    checkedAt: NOW - 1000,
  };

  it("serves the cache inside the window without touching the network", async () => {
    const h = harness({ initial: { last: cached, dismissedVersion: null } });
    const info = await checkForUpdate({ force: false }, h.env);

    expect(h.fetches()).toBe(0);
    expect(info.latest).toBe("0.1.35");
    expect(info.checkedAt).toBe(cached.checkedAt);
  });

  it("goes to the network once the window has elapsed", async () => {
    const stale = { ...cached, checkedAt: NOW - THROTTLE_MS - 1 };
    const h = harness({ initial: { last: stale, dismissedVersion: null } });
    await checkForUpdate({ force: false }, h.env);

    expect(h.fetches()).toBe(1);
    expect((h.state().last as { checkedAt: number }).checkedAt).toBe(NOW);
  });

  it("force always goes live, even with a fresh cache", async () => {
    // A user who clicks "Check for updates" and is answered from cache has
    // been told something untrue.
    const h = harness({ initial: { last: cached, dismissedVersion: null } });
    await checkForUpdate({ force: true }, h.env);
    expect(h.fetches()).toBe(1);
  });

  it("re-evaluates the cached result against the RUNNING version", async () => {
    // The user installed 0.1.35 while a cached "0.1.35 available" was still
    // fresh; serving it verbatim would nag about an update already applied.
    const h = harness({
      current: "0.1.35",
      initial: { last: cached, dismissedVersion: null },
    });
    const info = await checkForUpdate({ force: false }, h.env);

    expect(h.fetches()).toBe(0);
    expect(info.current).toBe("0.1.35");
    expect(info.hasUpdate).toBe(false);
  });
});

describe("checkForUpdate — failures are silent and never 'up to date'", () => {
  const modes: [string, () => Promise<unknown>][] = [
    ["offline", () => Promise.reject(new TypeError("fetch failed"))],
    ["aborted / timed out", () => Promise.reject(Object.assign(new Error("abort"), { name: "AbortError" }))],
    ["rate limited (403)", () => Promise.reject(new Error("GitHub responded 403"))],
    ["no release yet (404)", () => Promise.reject(new Error("GitHub responded 404"))],
    ["malformed body", () => Promise.reject(new SyntaxError("Unexpected token"))],
  ];

  for (const [name, impl] of modes) {
    it(`resolves as unreachable — ${name}`, async () => {
      const h = harness({ fetchImpl: impl });
      const info = await checkForUpdate({ force: true }, h.env);

      expect(info.reachable).toBe(false);
      expect(info.hasUpdate).toBe(false);
      expect(info.latest).toBeNull();
      expect(info.current).toBe("0.1.34"); // the running version is still reported
    });
  }

  it("reports unreachable — not 'up to date' — so the UI can tell them apart", async () => {
    const offline = await checkForUpdate({ force: true }, harness({ fetchImpl: () => Promise.reject(new Error("x")) }).env);
    const current = await checkForUpdate({ force: true }, harness({ current: "0.1.35" }).env);

    expect(offline.hasUpdate).toBe(current.hasUpdate); // both false...
    expect(offline.reachable).not.toBe(current.reachable); // ...but distinguishable
  });

  it("does not overwrite a good cached result with a failure", async () => {
    const good = {
      current: "0.1.34",
      latest: "0.1.35",
      hasUpdate: true,
      reachable: true,
      releaseUrl: null,
      downloadUrl: null,
      downloadArch: null,
      checkedAt: NOW - THROTTLE_MS - 1,
    };
    const h = harness({
      initial: { last: good, dismissedVersion: null },
      fetchImpl: () => Promise.reject(new Error("offline")),
    });
    await checkForUpdate({ force: false }, h.env);
    expect(h.state().last).toMatchObject({ latest: "0.1.35" });
  });

  it("treats a payload with no tag as unreachable rather than inventing a version", async () => {
    const h = harness({ fetchImpl: async () => ({ nothing: true }) });
    const info = await checkForUpdate({ force: true }, h.env);
    expect(info.reachable).toBe(false);
    expect(info.latest).toBeNull();
  });
});

describe("dismissal", () => {
  it("is empty until something is dismissed", async () => {
    const h = harness({});
    expect(await readDismissal(h.env)).toEqual({ dismissedVersion: null });
  });

  it("remembers the version, and survives a later check", async () => {
    const h = harness({});
    await dismissVersion("0.1.35", h.env);
    expect(await readDismissal(h.env)).toEqual({ dismissedVersion: "0.1.35" });

    await checkForUpdate({ force: true }, h.env);
    expect(await readDismissal(h.env)).toEqual({ dismissedVersion: "0.1.35" });
  });

  it("is keyed by version, so a newer release is not suppressed", async () => {
    // The consumer compares `latest` against `dismissedVersion`; storing the
    // version (not a boolean) is what makes the suppression expire by itself.
    const h = harness({});
    await dismissVersion("0.1.35", h.env);
    const { dismissedVersion } = await readDismissal(h.env);

    expect(dismissedVersion).toBe("0.1.35");
    expect(dismissedVersion).not.toBe("0.1.36");
  });
});
