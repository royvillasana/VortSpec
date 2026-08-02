import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BUILT_IN_PRESETS } from "@vortspec/core/presets";
import { applyPreset, listPresets, previewPreset, selectDefaultPreset, createPresetFromCurrent, importPreset } from "./preset-store";
import { setThemeTokenOverride, readThemeOverrides } from "./theme-override-store";
import { getInspectorTokens } from "./token-parser";

/**
 * Presets (change: design-system-style-panel, Phase 4). The subtle part is not applying values — it is who
 * OWNS them afterwards:
 *
 * - Default is not a preset; it is the project's source design system, and returning to it must undo the
 *   preset's contribution WITHOUT undoing the user's own edits.
 * - Editing after applying a built-in edits the PROJECT, never the built-in.
 */

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function w(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), content, "utf8");
}

/** A consumed-library project whose source declares the values Default must be able to restore. */
async function project(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vs-presets-"));
  await w(".sdd-de/project.yaml", ["design_source: library", "component_library: astryx", "token_file: src/tokens.css"].join("\n"));
  await w(
    "src/tokens.css",
    [
      ":root {",
      "  --color-accent: light-dark(#262626, #ebebeb);",
      "  --radius-card: 20px;",
      "  --color-border: #E4E7EC;",
      "}",
      "",
    ].join("\n"),
  );
  return dir;
}

const valueOf = async (p: string, token: string): Promise<string | undefined> =>
  (await getInspectorTokens(p)).tokens.find((t) => t.name === token)?.resolvedValue;

describe("listPresets", () => {
  it("offers the three built-ins, with Default (null) active until a preset is applied", async () => {
    const p = await project();
    const list = await listPresets(p);
    expect(list.presets.map((x) => x.id)).toEqual(["ocean", "forest", "sunset"]);
    expect(list.presets.every((x) => x.builtIn)).toBe(true);
    // Default is NOT in the list as a stored preset — `null` IS Default.
    expect(list.activeId).toBeNull();
  });
});

describe("previewPreset", () => {
  it("says what will change, what will be introduced, and what this project cannot express", async () => {
    const p = await project();
    const plan = await previewPreset(p, "ocean");
    const by = Object.fromEntries(plan.outcomes.map((o) => [o.role, o]));

    // Resolves against the project's REAL token names.
    expect(by["color.primary"]).toMatchObject({ token: "color-accent", outcome: "change" });
    expect(by["radius.base"]).toMatchObject({ token: "radius-card", outcome: "change" });
    // The project has no type scale, so the preset brings one — that is how "no caption size" is answered.
    expect(by["font.family"]).toMatchObject({ outcome: "introduce", token: "font-family-body" });
    // No background/surface tokens here: reported as skipped rather than invented.
    expect(by["color.background"]).toMatchObject({ outcome: "skip" });
    expect(by["color.background"].token).toBeUndefined();
  });

  it("keeps a light-dark token's dark half rather than flattening it", async () => {
    const p = await project();
    const plan = await previewPreset(p, "ocean");
    const primary = plan.outcomes.find((o) => o.role === "color.primary")!;
    // Ocean states both modes, so both are written — the project keeps a working dark theme.
    expect(primary.value).toBe("light-dark(#0A84FF, #4DA3FF)");
  });
});

describe("applyPreset", () => {
  it("writes the resolved roles, introduces what it can, and marks itself active", async () => {
    const p = await project();
    const plan = await applyPreset(p, "forest");

    expect(await valueOf(p, "color-accent")).toBe("light-dark(#2E7D5B, #5FA882)");
    expect(await valueOf(p, "radius-card")).toBe("12px");
    expect((await listPresets(p)).activeId).toBe("forest");

    // Forest's type is a Google family, so it is recorded for fetching — named but unfetched is the
    // silent-fallback failure this avoids.
    expect((await readThemeOverrides(p)).googleFonts).toContain("Poppins");

    // The skipped roles are REPORTED, not silently dropped.
    expect(plan.outcomes.filter((o) => o.outcome === "skip").map((o) => o.role)).toContain("color.background");

    // The project's own token file is never written — this is a consumed source.
    expect(await readFile(join(p, "src/tokens.css"), "utf8")).toContain("--color-accent: light-dark(#262626, #ebebeb);");
  });

  it("leaves the built-in's own definition untouched, so it can be re-applied", async () => {
    const p = await project();
    const before = JSON.stringify(BUILT_IN_PRESETS.find((x) => x.id === "ocean"));

    await applyPreset(p, "ocean");
    // Editing after applying edits the PROJECT — a built-in is a starting point, not a live binding.
    await setThemeTokenOverride(p, "color-accent", "light-dark(#111111, #eeeeee)");

    expect(await valueOf(p, "color-accent")).toBe("light-dark(#111111, #eeeeee)");
    expect(JSON.stringify(BUILT_IN_PRESETS.find((x) => x.id === "ocean"))).toBe(before);

    // And re-applying restores its original values.
    await applyPreset(p, "ocean");
    expect(await valueOf(p, "color-accent")).toBe("light-dark(#0A84FF, #4DA3FF)");
  });
});

describe("selectDefaultPreset", () => {
  it("restores the SOURCE design system while keeping the user's own edits", async () => {
    const p = await project();

    // The user's own decision, made before any preset.
    await setThemeTokenOverride(p, "color-border", "#D0D5DD");
    await applyPreset(p, "sunset");
    expect(await valueOf(p, "color-accent")).toBe("light-dark(#FF6B4A, #FF8A6E)");

    await selectDefaultPreset(p);

    // The preset's contribution is gone — the library's own value is back.
    expect(await valueOf(p, "color-accent")).toBe("light-dark(#262626, #ebebeb)");
    // The user's own edit survives. Clearing it too would make "go back to Default" destructive.
    expect(await valueOf(p, "color-border")).toBe("#D0D5DD");
    expect((await listPresets(p)).activeId).toBeNull();
  });

  it("treats a token the user edited AFTER applying as theirs, so Default keeps it", async () => {
    const p = await project();
    await applyPreset(p, "ocean");
    // Touching a preset-written token takes it over.
    await setThemeTokenOverride(p, "radius-card", "3px");

    await selectDefaultPreset(p);
    expect(await valueOf(p, "radius-card")).toBe("3px");
    // …while a preset value they never touched goes back to the source.
    expect(await valueOf(p, "color-accent")).toBe("light-dark(#262626, #ebebeb)");
  });
});

describe("createPresetFromCurrent / importPreset", () => {
  it("captures the current values under a name and lists it beside the built-ins", async () => {
    const p = await project();
    await setThemeTokenOverride(p, "color-accent", "light-dark(#5433eb, #ebebeb)");

    const made = await createPresetFromCurrent(p, "My brand");
    expect(made.builtIn).toBe(false);
    expect(made.values["color.primary"]).toEqual({ light: "#5433eb", dark: "#ebebeb" });
    expect((await listPresets(p)).presets.map((x) => x.id)).toContain(made.id);
  });

  it("refuses a malformed import rather than half-applying it", async () => {
    const p = await project();
    expect(await importPreset(p, { nope: true })).toBeNull();
    const ok = await importPreset(p, {
      id: "shared-one",
      name: "Shared",
      summary: "From a teammate",
      values: { "color.primary": { light: "#123456" } },
    });
    expect(ok?.id).toBe("shared-one");
    // An imported preset is never marked built-in, whatever the file claimed.
    expect(ok?.builtIn).toBe(false);
  });
});

describe("previewPreset — the visual, not the value list", () => {
  it("returns how the design system WOULD look, so a preset is judged by sight before applying", async () => {
    const p = await project();
    const plan = await previewPreset(p, "ocean");
    const preview = plan.preview as Record<string, string> | undefined;

    // The projected preview differs from what is in effect now — otherwise there would be nothing to see.
    expect(preview?.primary).toBe("light-dark(#0A84FF, #4DA3FF)");
    expect(preview?.radius).toBe("4px");
    // A role the preset INTRODUCES is previewed too, or a preset that brings a type scale would preview
    // without it.
    expect(preview?.fontFamily).toContain("SF Pro Text");
  });

  it("previewing writes nothing — it is a question, not a change", async () => {
    const p = await project();
    const before = await valueOf(p, "color-accent");
    await previewPreset(p, "sunset");
    expect(await valueOf(p, "color-accent")).toBe(before);
    expect((await listPresets(p)).activeId).toBeNull();
  });
});
