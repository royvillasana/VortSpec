import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isDependencyPath, pickExport, resolveCssImports } from "./css-imports";
import { getInspectorTokens, setInspectorTokenValue } from "./token-parser";
import { getProjectPaletteHtml } from "../lite/lite-source";

/**
 * `@import` resolution for token files (change: design-system-token-editor). A consumed library's token
 * file typically declares nothing and just imports the vendor theme, so reading only the entry file found
 * zero tokens — the Tokens tab and the Design System palette were empty and every lever had no live value.
 */

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
}

/** The shape consume provisioning actually produces for Astryx: entry imports the published theme. */
const VENDOR = "node_modules/@astryxdesign/theme-neutral/dist/theme.css";
const VENDOR_CSS = [
  "@layer astryx-theme {",
  "@scope ([data-astryx-theme=\"neutral\"]) to ([data-astryx-theme]) {",
  "  :scope {",
  "    --color-accent: light-dark(#262626, #ebebeb);",
  "    --radius-container: 0.75rem;",
  "    --color-border: light-dark(#00000014, #FFFFFF1A);",
  "  }",
  "}",
  "}",
  "",
].join("\n");

async function astryxProject(entryCss: string): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vs-css-imports-"));
  await write(
    ".sdd-de/project.yaml",
    [
      "design_source: library",
      "component_library: astryx",
      "component_dir: src/components",
      "token_file: src/styles/tokens.css",
      "theme_apply: css-vars",
    ].join("\n"),
  );
  // Published with an `exports` map — `./theme.css` resolves to `./dist/theme.css`, so the literal path
  // alone would miss it.
  await write(
    "node_modules/@astryxdesign/theme-neutral/package.json",
    JSON.stringify({
      name: "@astryxdesign/theme-neutral",
      main: "./dist/source.js",
      exports: { ".": { import: "./dist/source.mjs" }, "./theme.css": { default: "./dist/theme.css" } },
    }),
  );
  await write(VENDOR, VENDOR_CSS);
  await write("src/styles/tokens.css", entryCss);
  return dir;
}

describe("resolveCssImports", () => {
  it("follows a bare package specifier through the package's exports map", async () => {
    const p = await astryxProject("@import '@astryxdesign/theme-neutral/theme.css';\n\n[data-astryx-theme] {\n}\n");
    const r = await resolveCssImports(p, "src/styles/tokens.css");
    expect(r.files).toEqual(["src/styles/tokens.css", VENDOR]);
    expect(r.unresolved).toEqual([]);
    expect(r.css).toContain("--color-accent");
  });

  it("follows relative partials and keeps cascade order (the importing file wins)", async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-css-imports-"));
    await write(".sdd-de/project.yaml", ["design_source: figma", "token_file: src/tokens.css"].join("\n"));
    await write("src/primitives.css", ":root { --color-primary: #111111; --radius-lg: 8px; }\n");
    await write("src/tokens.css", '@import "./primitives.css";\n:root { --color-primary: #7C6FF0; }\n');

    const r = await resolveCssImports(dir, "src/tokens.css");
    expect(r.files).toEqual(["src/tokens.css", "src/primitives.css"]);
    // The imported segment comes FIRST, so the entry's own re-declaration overrides it — the CSS cascade.
    expect(r.segments.map((s) => s.file)).toEqual(["src/primitives.css", "src/tokens.css"]);

    const t = await getInspectorTokens(dir);
    expect(t.tokens.find((x) => x.name === "color-primary")?.resolvedValue).toBe("#7C6FF0");
    expect(t.tokens.find((x) => x.name === "color-primary")?.fromImport).toBeUndefined();
    expect(t.tokens.find((x) => x.name === "radius-lg")?.fromImport).toBe("src/primitives.css");
  });

  it("survives a cycle and an unresolvable specifier without throwing", async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-css-imports-"));
    await write("a.css", '@import "./b.css";\n@import "./nope.css";\n@import url("https://cdn/x.css");\n:root { --a: 1px; }\n');
    await write("b.css", '@import "./a.css";\n:root { --b: 2px; }\n');
    const r = await resolveCssImports(dir, "a.css");
    expect(r.files).toEqual(["a.css", "b.css"]);
    // Both a missing file and a remote stylesheet are simply "not on disk" — reported, then skipped.
    expect(r.unresolved).toEqual(["./nope.css", "https://cdn/x.css"]);
    expect(r.css).toContain("--a: 1px");
    expect(r.css).toContain("--b: 2px");
  });

  it("resolves exports maps, condition objects, and `*` patterns", () => {
    expect(pickExport({ "./theme.css": { default: "./dist/theme.css" } }, "./theme.css")).toBe("./dist/theme.css");
    expect(pickExport({ ".": { style: "./a.css", import: "./a.mjs" } }, ".")).toBe("./a.css");
    expect(pickExport({ "./styles/*": "./dist/styles/*" }, "./styles/base.css")).toBe("./dist/styles/base.css");
    expect(pickExport("./index.js", ".")).toBe("./index.js");
    expect(pickExport({ "./theme.css": "./dist/theme.css" }, "./other.css")).toBeNull();
  });
});

describe("a consumed library's real tokens are readable, and its files stay untouched", () => {
  const ENTRY = "@import '@astryxdesign/theme-neutral/theme.css';\n\n[data-astryx-theme] {\n}\n";

  it("reads the vendor theme's real values and attributes them to the import", async () => {
    const p = await astryxProject(ENTRY);
    const t = await getInspectorTokens(p);
    const accent = t.tokens.find((x) => x.name === "color-accent");
    expect(accent).toMatchObject({
      resolvedValue: "light-dark(#262626, #ebebeb)",
      type: "color",
      fromImport: VENDOR,
    });
    // `:scope` inside `@scope (…)` IS the theme root, so these are default-context values, not a mode.
    expect(t.tokens.find((x) => x.name === "radius-container")?.resolvedValue).toBe("0.75rem");
  });

  it("routes an edit to an imported vendor token into the overlay and re-themes the palette", async () => {
    const p = await astryxProject(ENTRY);
    const vendorBefore = await readFile(join(p, VENDOR), "utf8");

    await setInspectorTokenValue(p, "color-accent", "light-dark(#7C6FF0, #ebebeb)");

    // The dependency is never written — the next `npm install` would wipe it anyway.
    expect(await readFile(join(p, VENDOR), "utf8")).toBe(vendorBefore);
    const overlay = JSON.parse(await readFile(join(p, ".vortspec/theme-overrides.json"), "utf8"));
    // `origin` tags who wrote it (change: design-system-style-panel) — a user edit, here.
    expect(overlay.tokens["color-accent"]).toMatchObject({ value: "light-dark(#7C6FF0, #ebebeb)", origin: "user" });

    // Every reader sees it: the overlay-aware token list AND the Design System palette beside the editor.
    const t = await getInspectorTokens(p);
    expect(t.tokens.find((x) => x.name === "color-accent")?.resolvedValue).toBe("light-dark(#7C6FF0, #ebebeb)");
    expect(await getProjectPaletteHtml(p)).toContain("#7C6FF0");
  });

  it("writes a project-owned partial in place rather than routing it to the overlay", async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-css-imports-"));
    await write(".sdd-de/project.yaml", ["design_source: figma", "token_file: src/tokens.css"].join("\n"));
    await write("src/primitives.css", ":root {\n  --color-primary: #111111;\n}\n");
    await write("src/tokens.css", '@import "./primitives.css";\n');

    await setInspectorTokenValue(dir, "color-primary", "#7C6FF0");

    // The partial is the project's own file, so the edit lands there — not in the overlay.
    expect(await readFile(join(dir, "src/primitives.css"), "utf8")).toContain("--color-primary: #7C6FF0;");
    await expect(readFile(join(dir, ".vortspec/theme-overrides.json"), "utf8")).rejects.toThrow();
  });

  it("classifies dependency paths on both separators", () => {
    expect(isDependencyPath("node_modules/@x/y/theme.css")).toBe(true);
    expect(isDependencyPath("src/styles/node_modules.css")).toBe(false);
    expect(isDependencyPath("src/tokens.css")).toBe(false);
  });
});
