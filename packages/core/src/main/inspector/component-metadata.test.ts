import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metadataFileName, readComponentMetadata, metadataPlan, buildMetadataPrompt } from "./component-metadata";

async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "component_dir: src/components\n", "utf8");
  await writeFile(join(dir, ".sdd-de/components.json"), JSON.stringify([{ name: "Button" }, { name: "Toolbar" }]), "utf8");
  await writeFile(join(dir, "src/components/Button.tsx"), "export const Button = () => <button/>;\n", "utf8");
  await writeFile(join(dir, "src/components/Toolbar.tsx"), "export const Toolbar = () => <div/>;\n", "utf8");
}

describe("component metadata (Plan B6)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-meta-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("normalizes the metadata filename", () => {
    expect(metadataFileName("Button")).toBe("button.json");
    expect(metadataFileName("IconWrapper")).toBe("iconwrapper.json");
  });

  it("reports full coverage gap + a prompt naming every missing component and its target file", async () => {
    const plan = await metadataPlan(dir);
    expect(plan).toMatchObject({ total: 2, withMetadata: 0 });
    expect(plan.missing.sort()).toEqual(["Button", "Toolbar"]);
    expect(plan.prompt).toContain(".vortspec/metadata/button.json");
    expect(plan.prompt).toContain(".vortspec/metadata/toolbar.json");
    expect(plan.prompt).toContain("antiPatterns");
  });

  it("reads a generated metadata file and shrinks the coverage gap", async () => {
    await mkdir(join(dir, ".vortspec/metadata"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec/metadata/button.json"),
      JSON.stringify({ name: "Button", summary: "A clickable action.", usage: ["for primary actions"], patterns: [], antiPatterns: ["don't use for navigation"] }),
      "utf8",
    );
    expect((await readComponentMetadata(dir, "Button"))?.summary).toBe("A clickable action.");
    const plan = await metadataPlan(dir);
    expect(plan.withMetadata).toBe(1);
    expect(plan.missing).toEqual(["Toolbar"]);
  });

  it("emits an empty prompt when nothing is missing", () => {
    expect(buildMetadataPrompt([])).toContain("Components and their target files:");
  });
});
