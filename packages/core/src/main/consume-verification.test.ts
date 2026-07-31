import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLibraryReadiness } from "./workspace/library-readiness";
import { detectLibraryInRepo } from "./workspace/library-detect";
import { enumeratePackageComponent } from "./inspector/library-enumerate";
import { setInspectorTokenValue, getInspectorTokens } from "./inspector/token-parser";
import { setThemeTokenOverride } from "./inspector/theme-override-store";
import { materializeComponentCss } from "@vortspec/core/token-writers";
import { detectLibrary, isConsumeSource, COMPONENT_LIBRARY_OPTIONS } from "@vortspec/core/setup";
import { EMPTY_THEME_OVERRIDES, setComponentOverride } from "@vortspec/core/theme-overrides";

/**
 * Phase 13 verification (change: consume-component-libraries) — fixture-driven runtime checks that exercise
 * the REAL consume logic (readiness gating, intake detection, .d.ts enumeration, multi-format + overlay
 * writes) against temp projects on disk. What genuinely needs a live network/toolchain — actually running
 * `npx shadcn` (13.1) or `npm install @mui/material` (13.2) — is out of scope here; instead each fixture
 * reproduces the on-disk STATE those commands would produce and asserts the gate/enumeration behaves.
 */

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function project(yaml: string): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vs-consume-verify-"));
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await writeFile(join(dir, ".sdd-de", "project.yaml"), yaml, "utf8");
  return dir;
}

describe("13.1 shadcn (cli-registry) — readiness flips only after source lands in component_dir", () => {
  const yaml = [
    "design_source: library",
    "component_library: shadcn",
    "component_library_kind: cli-registry",
    "component_dir: src/components",
    "token_file: src/globals.css",
  ].join("\n");

  it("gates on real component source, and never rebuilds a consumed library", async () => {
    const p = await project(yaml);
    await mkdir(join(p, "src", "components"), { recursive: true });

    // Before the CLI runs: component_dir is empty → NOT ready (the gate holds).
    let r = await getLibraryReadiness(p);
    expect(r).toMatchObject({ applicable: true, ready: false, kind: "cli-registry" });

    // After the CLI copies real source in (simulated): a file appears → ready flips true.
    await writeFile(join(p, "src", "components", "button.tsx"), "export const Button = () => null;\n", "utf8");
    r = await getLibraryReadiness(p);
    expect(r.ready).toBe(true);

    // A library source is a CONSUME source → the auto/manual builder is guarded off (no reimplementation).
    expect(isConsumeSource("library")).toBe(true);
  });

  it("intake detects shadcn from a root components.json", async () => {
    const p = await project(yaml);
    await writeFile(join(p, "components.json"), JSON.stringify({ style: "new-york" }), "utf8");
    await writeFile(join(p, "package.json"), JSON.stringify({ dependencies: {} }), "utf8");
    expect(await detectLibraryInRepo(p)).toMatchObject({ library: "shadcn", kind: "cli-registry" });
  });
});

describe("13.2 installed-package (MUI) — package gate + .d.ts enumeration, no VortSpec Storybook", () => {
  const yaml = [
    "design_source: library",
    "component_library: mui",
    "component_library_kind: installed-package",
    "library_import_base: @mui/material",
    "component_dir: src/components",
    "token_file: src/theme.ts",
  ].join("\n");

  it("readiness gates on the package resolving, and props/variants enumerate from bundled .d.ts", async () => {
    const p = await project(yaml);

    // Before install: package absent → NOT ready.
    expect(await getLibraryReadiness(p)).toMatchObject({ applicable: true, ready: false, kind: "installed-package" });

    // After install (simulated node_modules): package resolves → ready, AND its .d.ts enumerates.
    await mkdir(join(p, "node_modules", "@mui", "material"), { recursive: true });
    await writeFile(join(p, "node_modules", "@mui", "material", "package.json"), JSON.stringify({ name: "@mui/material" }), "utf8");
    await writeFile(
      join(p, "node_modules", "@mui", "material", "index.d.ts"),
      `export interface ButtonProps {\n  variant?: "text" | "outlined" | "contained";\n  disabled?: boolean;\n}\n`,
      "utf8",
    );

    expect((await getLibraryReadiness(p)).ready).toBe(true);

    const enumd = await enumeratePackageComponent(p, "@mui/material", "Button");
    const variant = enumd.props.find((x) => x.name === "variant");
    expect(variant?.variants).toEqual(["text", "outlined", "contained"]);
    expect(enumd.props.find((x) => x.name === "disabled")?.optional).toBe(true);
  });

  it("a library source is a consume source — the VortSpec Storybook backstop is guarded off", () => {
    // RunApp's storybook-install backstop and DesignManifest's generate branch both key off this predicate.
    expect(isConsumeSource("library")).toBe(true);
    expect(isConsumeSource("enterprise")).toBe(true);
    expect(isConsumeSource("figma")).toBe(false); // extract sources still build/serve a VortSpec Storybook
  });
});

describe("13.3 Emotion-only — a styling strategy, never a consumable component library", () => {
  it("detectLibrary flags @emotion/styled as styling-only with no library", () => {
    const d = detectLibrary({ "@emotion/styled": "^11", "@emotion/react": "^11" }, false);
    expect(d.stylingOnly).toBe(true);
    expect(d.library).toBeUndefined();
  });
  it("styled-components is likewise styling-only", () => {
    expect(detectLibrary({ "styled-components": "^6" }, false).stylingOnly).toBe(true);
  });
  it("emotion/styled-components are NOT offered as component-library options", () => {
    const values = COMPONENT_LIBRARY_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("emotion");
    expect(values).not.toContain("styled-components");
  });
});

describe("13.4 Customization — JS theme-object write, overlay re-theming, per-component isolation", () => {
  it("a JS theme-object token_file write SUCCEEDS (not a silent no-op)", async () => {
    // Owned (extract) source → in-place multi-format write. token_file is a JS theme object.
    const p = await project(["design_source: figma", "token_file: src/theme.ts", "component_dir: src"].join("\n"));
    await mkdir(join(p, "src"), { recursive: true });
    await writeFile(
      join(p, "src", "theme.ts"),
      `export const theme = {\n  palette: { primary: { main: "#000000" } },\n};\n`,
      "utf8",
    );
    // The write key is the theme-object path (what the token↔theme-key map resolves to).
    await setInspectorTokenValue(p, "palette.primary.main", "#635bff");
    expect(await readFile(join(p, "src", "theme.ts"), "utf8")).toContain('main: "#635bff"');
  });

  it("a token edit re-themes every reader through the durable overlay", async () => {
    const p = await project(["design_source: enterprise", "token_file: tokens.css", "component_dir: src"].join("\n"));
    await writeFile(join(p, "tokens.css"), ":root {\n  --primary: #000000;\n}\n", "utf8");
    await setThemeTokenOverride(p, "primary", "#635bff");
    const tokens = await getInspectorTokens(p);
    expect(tokens.tokens.find((t) => t.name === "primary")?.resolvedValue).toBe("#635bff");
  });

  it("a per-component override changes ONLY that component (data-component-scoped)", () => {
    const o = setComponentOverride(EMPTY_THEME_OVERRIDES, "Button", {}, { background: "var(--primary)" });
    const css = materializeComponentCss(o);
    expect(css).toContain('[data-component="Button"]');
    expect(css).not.toContain('[data-component="Card"]'); // isolation: Card is untouched
  });
});

describe("13.5 Enterprise customization — overlay applies, the client's real token file is NEVER modified", () => {
  it("routes the edit to the overlay and leaves the client's token file byte-for-byte", async () => {
    const p = await project(["design_source: enterprise", "token_file: client-tokens.css", "component_dir: src"].join("\n"));
    const original = ":root {\n  --primary: #000000;\n}\n";
    await writeFile(join(p, "client-tokens.css"), original, "utf8");

    const result = await setInspectorTokenValue(p, "primary", "#635bff");

    // The client's real source is untouched…
    expect(await readFile(join(p, "client-tokens.css"), "utf8")).toBe(original);
    // …the personalization lives in the durable overlay…
    const overlay = JSON.parse(await readFile(join(p, ".vortspec", "theme-overrides.json"), "utf8"));
    expect(overlay.tokens.primary.value).toBe("#635bff");
    // …and readers see the overlaid value.
    expect(result.tokens.find((t) => t.name === "primary")?.resolvedValue).toBe("#635bff");
  });
});
