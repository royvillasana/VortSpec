import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndexDigest, groundOptions } from "./index-digest";

async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\ncomponent_dir: src/components\n", "utf8");
  await writeFile(join(dir, "tokens.css"), ":root {\n  --color-primary: #0055FF;\n}\n", "utf8");
  await writeFile(join(dir, ".sdd-de/components.json"), JSON.stringify([{ name: "Button", level: "atom" }, { name: "Toolbar", level: "molecule" }]), "utf8");
  await writeFile(join(dir, "src/components/Button.tsx"), "export const Button = () => <button/>;\n", "utf8");
  await writeFile(join(dir, "src/components/Toolbar.tsx"), "export const Toolbar = () => (<div><Button/></div>);\n", "utf8");
  await writeFile(
    join(dir, ".vortspec/figma-components.json"),
    JSON.stringify([{ name: "Button", isSet: true, variants: ["Size"], key: "CK_BUTTON" }]),
    "utf8",
  );
}

describe("buildIndexDigest (Plan B3)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-digest-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("summarizes components (file, deps, figma key) and tokens (name=value)", async () => {
    await scaffold(dir);
    const d = await buildIndexDigest(dir);
    expect(d).toContain("Button [atom]");
    expect(d).toContain("src/components/Button.tsx");
    expect(d).toContain("figma:CK_BUTTON");
    expect(d).toContain("deps:button"); // Toolbar depends on Button
    expect(d).toContain("--color-primary = #0055FF");
  });

  it("returns an empty string for a project with no design system", async () => {
    await writeFile(join(dir, "package.json"), "{}", "utf8");
    expect(await buildIndexDigest(dir)).toBe("");
  });

  it("includes a component's AI-metadata summary and points to the metadata files (B6)", async () => {
    await scaffold(dir);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, ".vortspec/metadata"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec/metadata/button.json"),
      JSON.stringify({ name: "Button", summary: "A clickable primary action.", usage: [], patterns: [], antiPatterns: [] }),
      "utf8",
    );
    const d = await buildIndexDigest(dir);
    expect(d).toContain("A clickable primary action.");
    expect(d).toContain(".vortspec/metadata/");
  });
});

describe("groundOptions (Plan B3)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-ground-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prepends the digest to appendSystemPrompt only when grounding is requested", async () => {
    const base = { prompt: "edit", cwd: dir, appendSystemPrompt: "ORIGINAL" };
    const off = await groundOptions(base);
    expect(off.appendSystemPrompt).toBe("ORIGINAL"); // no flag → untouched

    const on = await groundOptions({ ...base, groundWithIndex: true });
    expect(on.appendSystemPrompt).toContain("Design-system index");
    expect(on.appendSystemPrompt?.endsWith("ORIGINAL")).toBe(true); // digest prepended, original kept
  });
});
