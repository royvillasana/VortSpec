import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorComponents } from "./component-reader";

/**
 * Regression: a roster entry in kebab-case ("color-picker") must be recognized as BUILT
 * when its source follows the SDD-DE convention `<kebab-dir>/<PascalCase>.tsx` — otherwise
 * the component reads as "detected" forever and its Build button never clears.
 */
async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, "src/components/color-picker"), { recursive: true });
  await mkdir(join(dir, "src/components/date-picker"), { recursive: true });
  await mkdir(join(dir, "src/components/tag"), { recursive: true });
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "component_dir: src/components\n", "utf8");
  await writeFile(
    join(dir, ".sdd-de/components.json"),
    JSON.stringify([{ name: "color-picker" }, { name: "date-picker" }, { name: "tag" }, { name: "table" }]),
    "utf8",
  );
  // PascalCase file inside a kebab folder (the SDD-DE convention).
  await writeFile(join(dir, "src/components/color-picker/ColorPicker.tsx"), "export const ColorPicker = () => null;\n", "utf8");
  await writeFile(join(dir, "src/components/date-picker/DatePicker.tsx"), "export const DatePicker = () => null;\n", "utf8");
  // Component whose entry is an index file in a folder that carries its name.
  await writeFile(join(dir, "src/components/tag/index.tsx"), "export const Tag = () => null;\n", "utf8");
  // "table" is in the roster but has NO source → must stay unbuilt.
}

describe("getInspectorComponents — built detection (normalized name / index)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-built-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("recognizes PascalCase-in-kebab-folder files as built", async () => {
    const r = await getInspectorComponents(dir);
    const cp = r.components.find((c) => c.name === "color-picker");
    const dp = r.components.find((c) => c.name === "date-picker");
    expect(cp?.file).toBe("src/components/color-picker/ColorPicker.tsx");
    expect(cp?.status).not.toBe("detected");
    expect(dp?.file).toBe("src/components/date-picker/DatePicker.tsx");
  });

  it("recognizes an index file inside a name-matching folder as built", async () => {
    const tag = (await getInspectorComponents(dir)).components.find((c) => c.name === "tag");
    expect(tag?.file).toBe("src/components/tag/index.tsx");
  });

  it("leaves a roster component with no source unbuilt (file null)", async () => {
    const table = (await getInspectorComponents(dir)).components.find((c) => c.name === "table");
    expect(table?.file).toBeNull();
  });
});
