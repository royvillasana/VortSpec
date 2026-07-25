import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInspectorToken,
  insertTokenDeclaration,
  themeBlockInsertIndex,
} from "./token-parser";

describe("insertTokenDeclaration (pure)", () => {
  it("inserts into the @theme block before its closing brace", () => {
    const css = "@theme inline {\n  --color-primary: #111;\n}\n:root {\n  --x: 1;\n}\n";
    const next = insertTokenDeclaration(css, "color-brand", "#7C6FF0");
    expect(next).not.toBeNull();
    const themeBody = next!.slice(0, themeBlockInsertIndex(next!) + 1);
    expect(themeBody).toContain("--color-brand: #7C6FF0;");
    // It landed inside @theme, not :root.
    expect(next!.indexOf("--color-brand")).toBeLessThan(next!.indexOf(":root"));
  });

  it("falls back to :root when there is no @theme block", () => {
    const css = ":root {\n  --a: 1;\n}\n";
    const next = insertTokenDeclaration(css, "b", "2");
    expect(next).toContain("--b: 2;");
  });

  it("rejects a normalized-name duplicate", () => {
    const css = "@theme {\n  --color-brand: #111;\n}\n";
    expect(insertTokenDeclaration(css, "Color/Brand", "#222")).toBeNull();
  });
});

describe("createInspectorToken", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-tokcreate-"));
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\n", "utf8");
    await writeFile(join(dir, "tokens.css"), "@theme inline {\n  --color-primary: #111;\n}\n", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a token, marks it hand-edited, and surfaces it as pushable", async () => {
    const r = await createInspectorToken(dir, "color-brand", "#7C6FF0");
    const created = r.tokens.find((t) => t.name === "color-brand");
    expect(created).toMatchObject({ resolvedValue: "#7C6FF0", type: "color", source: "hand-edited" });
    const css = await readFile(join(dir, "tokens.css"), "utf8");
    expect(css).toContain("--color-brand: #7C6FF0;");
  });

  it("rejects a duplicate normalized name (case-insensitive)", async () => {
    await expect(createInspectorToken(dir, "Color-Primary", "#222")).rejects.toThrow(/already exists/);
  });

  it("rejects an invalid token name", async () => {
    await expect(createInspectorToken(dir, "1bad name", "#222")).rejects.toThrow(/valid token name/);
  });

  it("bootstraps a missing token file + wires the import on first create", async () => {
    // A project whose configured token_file doesn't exist yet (the sample case).
    const proj = await mkdtemp(join(tmpdir(), "vortspec-tokboot-"));
    await mkdir(join(proj, ".sdd-de"), { recursive: true });
    await writeFile(join(proj, ".sdd-de/project.yaml"), "token_file: src/styles/tokens.css\n", "utf8");
    await mkdir(join(proj, "src"), { recursive: true });
    await writeFile(join(proj, "src/main.tsx"), 'import { App } from "./App";\n', "utf8");

    const r = await createInspectorToken(proj, "radius-sm", "4px", true);
    expect(r.tokens.find((t) => t.name === "radius-sm")).toMatchObject({ resolvedValue: "4px" });
    // The token file was created with the declaration…
    const css = await readFile(join(proj, "src/styles/tokens.css"), "utf8");
    expect(css).toContain("--radius-sm: 4px;");
    // …and the app entry now imports it (so the var resolves in the preview).
    const entry = await readFile(join(proj, "src/main.tsx"), "utf8");
    expect(entry).toContain('import "./styles/tokens.css";');
    await rm(proj, { recursive: true, force: true });
  });

  it("rejects an empty value", async () => {
    await expect(createInspectorToken(dir, "ok-name", "  ")).rejects.toThrow(/needs a value/);
  });
});
