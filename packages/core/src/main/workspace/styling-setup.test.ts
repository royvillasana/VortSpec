import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStylingPipeline, detectPackageManager, ensurePreviewImport } from "./styling-setup";

let root: string;

async function scaffold(styling: string, opts: { config?: boolean; preview?: boolean } = {}) {
  await mkdir(join(root, ".sdd-de"), { recursive: true });
  await writeFile(
    join(root, ".sdd-de", "project.yaml"),
    `framework: react\nlanguage: typescript\nstyling: ${styling}\ntoken_file: src/styles/tokens.css\ncomponent_dir: src/components\n`,
  );
  await mkdir(join(root, "src", "styles"), { recursive: true });
  await writeFile(join(root, "src", "styles", "tokens.css"), ":root { --color-brand-primary: #087990; }");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "t", devDependencies: { tailwindcss: "^3", postcss: "^8", autoprefixer: "^10" } }),
  );
  if (opts.config) await writeFile(join(root, "tailwind.config.js"), "module.exports = { content: [] };");
  if (opts.preview) {
    await mkdir(join(root, ".storybook"), { recursive: true });
    await writeFile(join(root, ".storybook", "preview.ts"), `import "../src/styles/tokens.css";\n`);
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vs-styling-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ensureStylingPipeline", () => {
  it("creates config, postcss, and entry css for a tailwind project that lacks them", async () => {
    await scaffold("tailwind");
    const r = await ensureStylingPipeline(root);
    expect(r.applicable).toBe(true);
    expect(existsSync(join(root, "tailwind.config.cjs"))).toBe(true);
    expect(existsSync(join(root, "postcss.config.cjs"))).toBe(true);
    expect(existsSync(join(root, "src/styles/tailwind.css"))).toBe(true);
    // deps already present in package.json → no install needed, no fix-it.
    expect(r.depsInstalled).toBe(true);
    expect(r.depsFixIt).toBeUndefined();
    // The generated config bridges tokens (self-parsing).
    expect(await readFile(join(root, "tailwind.config.cjs"), "utf8")).toContain("src/styles/tokens.css");
  });

  it("is non-destructive: never overwrites an existing config", async () => {
    await scaffold("tailwind", { config: true });
    const r = await ensureStylingPipeline(root);
    expect(r.preExisting).toContain("tailwind.config.js");
    expect(r.created).not.toContain("tailwind.config.cjs");
    expect(existsSync(join(root, "tailwind.config.cjs"))).toBe(false);
  });

  it("does nothing for a non-tailwind styling", async () => {
    await scaffold("css-modules");
    const r = await ensureStylingPipeline(root);
    expect(r.applicable).toBe(false);
    expect(existsSync(join(root, "tailwind.config.cjs"))).toBe(false);
  });

  it("wires the Storybook preview to import the tailwind entry before tokens", async () => {
    await scaffold("tailwind", { preview: true });
    await ensureStylingPipeline(root);
    const preview = await readFile(join(root, ".storybook", "preview.ts"), "utf8");
    expect(preview).toMatch(/import ["']\.\.\/src\/styles\/tailwind\.css["']/);
    // tailwind import comes before the tokens import
    expect(preview.indexOf("tailwind.css")).toBeLessThan(preview.indexOf("tokens.css"));
  });

  it("auto-installs deps (defaulting to npm) even with no lockfile", async () => {
    await scaffold("tailwind");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "t" }));
    const calls: { pm: string; pkgs: string[] }[] = [];
    const r = await ensureStylingPipeline(root, {
      install: async (pm, pkgs) => {
        calls.push({ pm, pkgs });
        return true;
      },
    });
    // No lockfile → defaults to npm and actually attempts the install (does not skip).
    expect(calls).toHaveLength(1);
    expect(calls[0].pm).toBe("npm");
    expect(calls[0].pkgs).toEqual(["tailwindcss", "postcss", "autoprefixer"]);
    expect(r.depsInstalled).toBe(true);
    expect(r.depsFixIt).toBeUndefined();
  });

  it("surfaces a fix-it command only when the install actually fails", async () => {
    await scaffold("tailwind");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "t" }));
    const r = await ensureStylingPipeline(root, { install: async () => false });
    expect(r.depsInstalled).toBe(false);
    expect(r.depsFixIt).toMatch(/npm install -D tailwindcss postcss autoprefixer/);
  });
});

describe("detectPackageManager", () => {
  it("maps lockfiles to managers", async () => {
    await writeFile(join(root, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(root)).toBe("pnpm");
  });
  it("returns null with no lockfile", () => {
    expect(detectPackageManager(root)).toBeNull();
  });
});

describe("ensurePreviewImport", () => {
  it("is idempotent — a second run does not duplicate the import", async () => {
    await scaffold("tailwind", { preview: true });
    const a = await ensurePreviewImport(root, ".storybook/preview.ts", "src/styles/tailwind.css", "src/styles/tokens.css");
    const b = await ensurePreviewImport(root, ".storybook/preview.ts", "src/styles/tailwind.css", "src/styles/tokens.css");
    expect(a).toBe(true);
    expect(b).toBe(false);
  });
});
