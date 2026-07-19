import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorComponents } from "./component-reader";

/**
 * Plan B1c — durable component join + dependency graph, wired through
 * getInspectorComponents. A first pass name-matches a keyed Figma component, records
 * its componentKey + the dependency graph in `.vortspec/maps/components.json`, and
 * after the Figma component is RENAMED the code component stays figma-backed by key.
 */
async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "component_dir: src/components\n", "utf8");
  await writeFile(join(dir, ".sdd-de/components.json"), JSON.stringify([{ name: "Button" }, { name: "Toolbar" }]), "utf8");
  await writeFile(join(dir, "src/components/Button.tsx"), "export const Button = () => <button/>;\n", "utf8");
  await writeFile(join(dir, "src/components/Toolbar.tsx"), "export const Toolbar = () => (<div><Button/></div>);\n", "utf8");
  await writeFigma(dir, "Button");
}

async function writeFigma(dir: string, buttonName: string): Promise<void> {
  await writeFile(
    join(dir, ".vortspec/figma-components.json"),
    JSON.stringify([{ name: buttonName, isSet: true, variants: ["Size"], key: "CK_BUTTON", id: "1:2" }]),
    "utf8",
  );
}

describe("durable component key + dependsOn (B1c)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-comp-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records the componentKey on a name match and the dependency graph", async () => {
    const r = await getInspectorComponents(dir);
    const button = r.components.find((c) => c.name === "Button");
    const toolbar = r.components.find((c) => c.name === "Toolbar");
    expect(button?.figmaBacked).toBe(true);
    expect(button?.figmaKey).toBe("CK_BUTTON");
    expect(toolbar?.dependsOn).toEqual(["button"]); // Toolbar renders <Button/>
    const map = JSON.parse(await readFile(join(dir, ".vortspec/maps/components.json"), "utf8"));
    expect(map.components["button"]).toMatchObject({ componentKey: "CK_BUTTON", componentSetId: "1:2" });
    expect(map.components["toolbar"].dependsOn).toEqual(["button"]);
  });

  it("stays figma-backed by key after the Figma component is renamed", async () => {
    await getInspectorComponents(dir); // pass 1 — record CK_BUTTON by name
    await writeFigma(dir, "Btn/Primary"); // Figma rename — name no longer matches "Button"
    const button = (await getInspectorComponents(dir)).components.find((c) => c.name === "Button");
    expect(button?.figmaBacked).toBe(true); // held by durable key, not name
    expect(button?.figmaKey).toBe("CK_BUTTON");
  });
});
