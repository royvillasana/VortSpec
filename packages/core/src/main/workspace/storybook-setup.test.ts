import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storybookInitType, storybookReadiness, storyGap, findGlobalStylesheet } from "./storybook-setup";

describe("storybookInitType", () => {
  it("maps frameworks to storybook init --type hints", () => {
    expect(storybookInitType("react")).toBe("react");
    expect(storybookInitType("next")).toBe("nextjs");
    expect(storybookInitType("vue")).toBe("vue3");
    expect(storybookInitType("nuxt")).toBe("vue3");
    expect(storybookInitType("svelte")).toBe("svelte");
    expect(storybookInitType("sveltekit")).toBe("sveltekit");
    expect(storybookInitType("angular")).toBe("angular");
    expect(storybookInitType("astro")).toBe("html");
    expect(storybookInitType("vanilla")).toBe("html");
  });

  it("returns null (auto-detect) for an unknown framework", () => {
    expect(storybookInitType("elm")).toBeNull();
    expect(storybookInitType(undefined)).toBeNull();
  });
});

describe("storybookReadiness", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-sb-"));
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(
      join(dir, ".sdd-de", "project.yaml"),
      "framework: react\ncomponent_dir: src/components\ntoken_file: src/styles/tokens.css\n",
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports NOT installed when there's only a Vite showcase gallery (the failure case)", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    await mkdir(join(dir, "src", "components", "ui"), { recursive: true });
    await writeFile(join(dir, "src", "components", "ui", "Button.tsx"), "export const Button = () => null;");
    const r = await storybookReadiness(dir);
    expect(r.installed).toBe(false);
    expect(r.hasScript).toBe(false);
    expect(r.hasConfig).toBe(false);
    expect(r.storyCount).toBe(0);
  });

  it("reports installed when a .storybook config AND a storybook script exist, and counts stories", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { storybook: "storybook dev -p 6006" } }));
    await mkdir(join(dir, ".storybook"), { recursive: true });
    await writeFile(join(dir, ".storybook", "main.ts"), "export default {};");
    await mkdir(join(dir, "src", "components", "ui"), { recursive: true });
    await writeFile(join(dir, "src", "components", "ui", "Button.tsx"), "export const Button = () => null;");
    await writeFile(join(dir, "src", "components", "ui", "Button.stories.tsx"), "export default {};");
    const r = await storybookReadiness(dir);
    expect(r.installed).toBe(true);
    expect(r.storyCount).toBe(1);
  });
});

describe("findGlobalStylesheet", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-css-"));
    await mkdir(join(dir, "src", "styles"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prefers the global stylesheet the app entry imports (Tailwind + tokens), NOT the raw token file", async () => {
    // The real failure: importing only tokens.css → variables but no utilities → raw components.
    await writeFile(join(dir, "src", "main.tsx"), `import "./index.css";\n`);
    await writeFile(
      join(dir, "src", "index.css"),
      `@import "./styles/tokens.css";\n@tailwind base;\n@tailwind utilities;\n`,
    );
    await writeFile(join(dir, "src", "styles", "tokens.css"), ":root{--color-x:#000}");
    const g = await findGlobalStylesheet(dir, "src/styles/tokens.css");
    expect(g).toBe("src/index.css");
  });

  it("falls back to a known Tailwind global when there's no entry import", async () => {
    await writeFile(join(dir, "src", "styles", "globals.css"), `@tailwind base;\n@tailwind utilities;\n`);
    const g = await findGlobalStylesheet(dir, undefined);
    expect(g).toBe("src/styles/globals.css");
  });

  it("falls back to the token file when no global stylesheet exists", async () => {
    const g = await findGlobalStylesheet(dir, "src/styles/tokens.css");
    expect(g).toBe("src/styles/tokens.css");
  });
});

describe("storyGap", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-gap-"));
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de", "project.yaml"), "component_dir: src/components\n");
    await mkdir(join(dir, "src", "components", "ui"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("counts components missing a story (the 'component exists but Storybook is empty' signal)", async () => {
    // 3 components, 1 story → 2 missing.
    for (const n of ["Button", "Input", "Badge"]) {
      await writeFile(join(dir, "src", "components", "ui", `${n}.tsx`), "export default () => null;");
    }
    await writeFile(join(dir, "src", "components", "ui", "Button.stories.tsx"), "export default {};");
    const g = await storyGap(dir);
    expect(g.components).toBe(3);
    expect(g.stories).toBe(1);
    expect(g.missing).toBe(2);
  });
});
