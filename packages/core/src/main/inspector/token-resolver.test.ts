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

describe("component-token binding — the Accordion (11/11)", () => {
  // The Accordion's 11 bound Figma variables (name + value), from get_design_context.
  const figmaBindings: ResolveCandidate[] = [
    c("color/surface/surface-on-color", "#FFFFFF"),
    c("color/borders/border-muted-01", "#D6D6D6"),
    c("color/text/text-body", "#221F1F"),
    c("color/container/container", "#FFFFFF"),
    c("spacing/padding/10", "10px"),
    c("spacing/padding/20", "20px"),
    c("spacing/padding/30", "30px"),
    c("typography/font-family/font-family-buttons", "Open Sans"),
    c("typography/font-weight/semibold-(600)", "semibold"),
    c("typography/line-height/md", "27px"),
    c("typography/font-size/md", "18px"),
  ];
  // The project's actual tokens (the generator renamed 7 of them) — value recovers those.
  const projectTokens: ResolveCandidate[] = [
    c("--color-surface-surface-on-color", "#FFFFFF"),
    c("--color-borders-border-muted-01", "#D6D6D6"),
    c("--color-text-text-body", "#221F1F"),
    c("--color-container-container", "#FFFFFF"),
    c("--spacing-10", "10px"),
    c("--spacing-20", "20px"),
    c("--spacing-30", "30px"),
    c("--font-family-buttons", "Open Sans"),
    c("--font-weight-semibold", "semibold"),
    c("--line-height-md", "27px"),
    c("--font-size-md", "18px"),
  ];

  it("resolves every Figma binding to a real project token — 4 by name, 7 by value", () => {
    const results = figmaBindings.map((b) => resolveToken(b, projectTokens));
    expect(results.every((r) => r.match !== null)).toBe(true); // 11/11
    const byName = results.filter((r) => r.signal === "name").length;
    const byValue = results.filter((r) => r.signal === "value").length;
    expect(byName).toBe(4);
    expect(byValue).toBe(7);
    // The component would bind var(--font-size-md) for Figma's typography/font-size/md.
    const fontSize = resolveToken(c("typography/font-size/md", "18px"), projectTokens);
    expect(fontSize.match?.name).toBe("--font-size-md");
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
