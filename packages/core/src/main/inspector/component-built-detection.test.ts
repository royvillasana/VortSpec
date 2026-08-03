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

/**
 * "Built" is a CLAIM. An unrecognized framework may use a convention none of the known
 * extensions describe, so a file that merely normalizes to a roster entry's name is not
 * evidence the component was built — and claiming it is silences the rebuild that would
 * have produced the real one.
 */
describe("getInspectorComponents — an unrecognized framework cannot claim 'built'", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-unknown-fw-"));
    await mkdir(join(dir, "src/components"), { recursive: true });
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(
      join(dir, ".sdd-de/components.json"),
      JSON.stringify([{ name: "Button" }]),
      "utf8",
    );
    // An unrelated utility that happens to share the component's name.
    await writeFile(join(dir, "src/components/Button.js"), "export const noop = () => {};\n", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports a name-collision match as a candidate, so rebuilding is not suppressed", async () => {
    await writeFile(
      join(dir, ".sdd-de/project.yaml"),
      "framework: brand-new-framework\ncomponent_dir: src/components\n",
      "utf8",
    );
    const r = await getInspectorComponents(dir);
    const btn = r.components.find((c) => c.name === "Button");
    // The path is still surfaced for the UI — only the CLAIM is withheld.
    expect(btn?.file).toBe("src/components/Button.js");
    expect(btn?.status).toBe("unknown");
  });

  it("still claims built for a recognized framework, so the resume guard keeps working", async () => {
    await writeFile(
      join(dir, ".sdd-de/project.yaml"),
      "framework: react\ncomponent_dir: src/components\n",
      "utf8",
    );
    const r = await getInspectorComponents(dir);
    expect(r.components.find((c) => c.name === "Button")?.status).toBe("built");
  });
});

/**
 * The absent-`framework:` case, now that the auto-builder refuses to start on an unresolvable
 * framework rather than looping. A legacy `project.yaml` with no framework key can no longer
 * display `built` for a component nobody can verify.
 */
describe("getInspectorComponents — an absent framework key cannot claim 'built' either", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-no-fw-"));
    await mkdir(join(dir, "src/components"), { recursive: true });
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(
      join(dir, ".sdd-de/components.json"),
      JSON.stringify([{ name: "Button" }]),
      "utf8",
    );
    await writeFile(join(dir, "src/components/Button.tsx"), "export const Button = () => null;\n", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // MERGE-ORDER EXCEPTION, pinned so it cannot be lost. Failing closed on an absent key is
  // correct, but `status: "unknown"` drives the auto-builder, so it is only safe once the
  // builder refuses to start on an unresolvable framework — a gate on the stacked branch that
  // has not merged. Until then this must stay `built`, or every legacy project.yaml goes back
  // into a permanent full-roster rebuild. Flip this expectation when the gate lands.
  it("still reports built when project.yaml declares no framework (pending the auto-build gate)", async () => {
    await writeFile(join(dir, ".sdd-de/project.yaml"), "component_dir: src/components\n", "utf8");
    const r = await getInspectorComponents(dir);
    const btn = r.components.find((c) => c.name === "Button");
    expect(btn?.file).toBe("src/components/Button.tsx");
    expect(btn?.status).toBe("built");
  });

  it("reports built once the framework is declared", async () => {
    await writeFile(
      join(dir, ".sdd-de/project.yaml"),
      "framework: react\ncomponent_dir: src/components\n",
      "utf8",
    );
    const r = await getInspectorComponents(dir);
    expect(r.components.find((c) => c.name === "Button")?.status).toBe("built");
  });
});
