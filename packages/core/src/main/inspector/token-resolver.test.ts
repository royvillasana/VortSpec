import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveToken,
  readTokenLinks,
  writeTokenLink,
  type ResolveCandidate,
} from "./token-resolver";

const c = (name: string, value: string, aliasOf?: string): ResolveCandidate => ({ name, value, aliasOf });

describe("resolveToken — layered precedence", () => {
  it("matches by normalized name across formatting differences", () => {
    const index = [c("color/surface/surface-on-color", "#FFFFFF")];
    const r = resolveToken(c("--color-surface-surface-on-color", "#FFFFFF"), index);
    expect(r.signal).toBe("name");
    expect(r.match?.name).toBe("color/surface/surface-on-color");
  });

  it("recovers a structural rename by value (the Excellus 7/11 case)", () => {
    // Figma `typography/font-size/md` = 18px; the only 18px token is `--font-size-md`.
    const index = [c("--font-size-md", "18px"), c("--font-size-lg", "20px")];
    const r = resolveToken(c("typography/font-size/md", "18px"), index);
    expect(r.signal).toBe("value");
    expect(r.match?.name).toBe("--font-size-md");
  });

  it("a persisted link overrides name and value", () => {
    const index = [c("color/container/container", "#FFFFFF"), c("color/surface/x", "#EEEEEE")];
    const r = resolveToken(c("--panel-bg", "#EEEEEE"), index, {
      links: { "panel-bg": "color/container/container" },
    });
    expect(r.signal).toBe("link");
    expect(r.match?.name).toBe("color/container/container");
  });

  it("a dangling link resolves to none + stale (never binds a missing target)", () => {
    const index = [c("color/container/container", "#FFFFFF")];
    const r = resolveToken(c("--panel-bg", "#FFFFFF"), index, {
      links: { "panel-bg": "color/gone/removed" },
    });
    expect(r.signal).toBe("none");
    expect(r.staleLink).toBe(true);
    expect(r.match).toBeNull();
  });

  it("matches by alias-graph position when name and value both drift", () => {
    // code token aliases primitive `blue-500`; a Figma semantic also aliases `blue/500`.
    const index = [c("color/surface/surface-control", "#007AC3", "color/excellus/blue/500")];
    const r = resolveToken(c("--accent", "#0A0A0A", "--color-excellus-blue-500"), index);
    expect(r.signal).toBe("alias");
    expect(r.match?.name).toBe("color/surface/surface-control");
  });
});

describe("resolveToken — ambiguity + misses", () => {
  it("does not guess when a value matches many candidates — returns suggestions", () => {
    // #007AC3 belongs to blue-500 AND surface-control (flattened alias look-alike).
    const index = [
      c("--color-excellus-blue-500", "#007AC3"),
      c("--color-surface-surface-control", "#007AC3"),
    ];
    const r = resolveToken(c("detected-accent", "#007AC3"), index);
    expect(r.signal).toBe("none");
    expect(r.match).toBeNull();
    expect(r.suggestions?.map((s) => s.name)).toEqual([
      "--color-excellus-blue-500",
      "--color-surface-surface-control",
    ]);
  });

  it("returns none when nothing shares name, value, or alias", () => {
    const index = [c("color/text/body", "#221F1F")];
    expect(resolveToken(c("--mystery", "#ABCDEF"), index).signal).toBe("none");
  });

  it("name beats value (precedence)", () => {
    const index = [c("--brand", "#111111"), c("--other", "#000000")];
    // candidate name-normalizes to `brand` (name hit) even though value equals `--other`.
    const r = resolveToken(c("brand", "#000000"), index);
    expect(r.signal).toBe("name");
    expect(r.match?.name).toBe("--brand");
  });
});

describe("token link store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-links-"));
    await mkdir(join(dir, ".vortspec"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns {} when no links file exists", async () => {
    expect(await readTokenLinks(dir)).toEqual({});
  });

  it("persists a link keyed by normalized code-token name", async () => {
    await writeTokenLink(dir, "--Brand-BG", "color/container/container");
    expect(await readTokenLinks(dir)).toEqual({ "brand-bg": "color/container/container" });
  });

  it("tolerates a malformed links file", async () => {
    await writeFile(join(dir, ".vortspec/token-links.json"), "{ not json", "utf8");
    expect(await readTokenLinks(dir)).toEqual({});
  });
});
