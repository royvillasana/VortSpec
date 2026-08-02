import { describe, expect, it, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fontStack, googleFontUrl, leadFamily, GOOGLE_FONTS_BUNDLED } from "@vortspec/core/fonts";
import { materializeCssOverlay } from "@vortspec/core/token-writers";
import { parseThemeOverrides } from "@vortspec/core/theme-overrides";
import { getFontSources } from "./fonts";
import { setThemeFontFamily } from "./theme-override-store";
import { getInspectorTokens } from "./token-parser";

/**
 * The font picker's sources and its ONE non-negotiable behaviour (change: design-system-style-panel,
 * Phase 3): a family that is picked must actually be LOADED. Picking without loading is the exact failure
 * this feature exists to prevent — the name changes, the type doesn't, and nothing says why.
 */

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function w(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), content, "utf8");
}

async function project(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vs-fonts-"));
  await w(".sdd-de/project.yaml", ["design_source: library", "token_file: src/tokens.css"].join("\n"));
  await w(
    "src/tokens.css",
    ":root {\n  --font-family-body: Figtree, system-ui, sans-serif;\n  --font-size-md: 16px;\n}\n",
  );
  return dir;
}

describe("fontStack", () => {
  it("puts the family first and always keeps a system fallback", () => {
    // The fallback is what makes a font that fails to load a cosmetic problem, not a broken screen.
    expect(fontStack("Inter")).toBe("Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif");
    expect(fontStack("Playfair Display").startsWith('"Playfair Display", ')).toBe(true);
    expect(fontStack("Inter").endsWith("sans-serif")).toBe(true);
  });

  it("does not repeat the family in its own fallback chain", () => {
    expect(fontStack("system-ui").split(",").filter((p) => p.trim() === "system-ui")).toHaveLength(1);
  });

  it("round-trips through leadFamily", () => {
    for (const f of ["Inter", "Playfair Display", "IBM Plex Sans"]) {
      expect(leadFamily(fontStack(f))).toBe(f);
    }
  });
});

describe("googleFontUrl", () => {
  it("builds a css2 URL, and is null when nothing was chosen", () => {
    // Null matters: a project that never picks a Google family must keep its pages free of any network
    // dependency, so nothing is emitted at all.
    expect(googleFontUrl([])).toBeNull();
    const url = googleFontUrl(["Playfair Display"], [400, 700])!;
    expect(url).toContain("family=Playfair+Display:wght@400;700");
    expect(url).toContain("display=swap");
  });
});

describe("getFontSources", () => {
  it("offers the project's own families and the bundled Google set, each labelled", async () => {
    const p = await project();
    const { families, googleComplete } = await getFontSources(p, false);

    const figtree = families.find((f) => f.family === "Figtree")!;
    // Figtree is BOTH in the project and in the bundled Google list — the project label must win, or the
    // family the design system already uses reads as a generic suggestion.
    expect(figtree.source).toBe("project");
    expect(figtree.detail).toBe("--font-family-body");

    expect(families.some((f) => f.source === "google" && f.family === "Inter")).toBe(true);
    // Not fetched yet — the bundled head is what opened.
    expect(googleComplete).toBe(false);
    expect(families.filter((f) => f.source === "google").length).toBeLessThanOrEqual(GOOGLE_FONTS_BUNDLED.length);
  });

  it("falls back to the bundled set when the catalog fetch fails", async () => {
    const p = await project();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { families, googleComplete } = await getFontSources(p, true);
    // A picker that fails to open would be worse than one offering fewer families.
    expect(googleComplete).toBe(false);
    expect(families.some((f) => f.family === "Inter")).toBe(true);
  });

  it("appends the full catalog when the fetch succeeds", async () => {
    const p = await project();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        // Google guards this response with an anti-JSON-hijacking prefix.
        text: async () => ")]}'\n" + JSON.stringify({ familyMetadataList: [{ family: "Zalgo Sans" }] }),
      }),
    );
    const { families, googleComplete } = await getFontSources(p, true);
    expect(googleComplete).toBe(true);
    expect(families.some((f) => f.family === "Zalgo Sans")).toBe(true);
  });
});

describe("choosing a family", () => {
  it("writes the stack AND records the Google family so it is actually fetched", async () => {
    const p = await project();

    await setThemeFontFamily(p, "font-family-body", fontStack("Playfair Display"), "Playfair Display");

    const overlay = parseThemeOverrides(JSON.parse(await readFile(join(p, ".vortspec/theme-overrides.json"), "utf8")));
    expect(overlay.tokens["font-family-body"].value).toContain("Playfair Display");
    expect(overlay.googleFonts).toEqual(["Playfair Display"]);

    // The emitted CSS leads with the @import — CSS requires it there, and without it the family is named
    // but never loaded, which is the silent-fallback failure this whole feature exists to prevent.
    const css = materializeCssOverlay(overlay);
    expect(css.startsWith("@import url(")).toBe(true);
    expect(css).toContain("family=Playfair+Display");
    expect(css).toContain("--font-family-body:");

    // And every reader sees the new stack.
    const tokens = await getInspectorTokens(p);
    expect(tokens.tokens.find((t) => t.name === "font-family-body")?.resolvedValue).toContain("Playfair Display");
  });

  it("emits no font import for a family that needs no fetching", async () => {
    const p = await project();
    await setThemeFontFamily(p, "font-family-body", fontStack("Helvetica Neue"));
    const overlay = parseThemeOverrides(JSON.parse(await readFile(join(p, ".vortspec/theme-overrides.json"), "utf8")));
    expect(overlay.googleFonts).toEqual([]);
    expect(materializeCssOverlay(overlay)).not.toContain("@import");
  });
});
