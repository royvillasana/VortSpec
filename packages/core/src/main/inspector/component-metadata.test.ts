import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metadataFileName,
  readComponentMetadata,
  metadataDiscovery,
  metadataPlan,
  buildMetadataPrompt,
} from "./component-metadata";

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
    expect(plan).toMatchObject({ total: 2, complete: 0, withMetadata: 0 });
    expect(plan.missing.sort()).toEqual(["Button", "Toolbar"]);
    expect(plan.prompt).toContain(".vortspec/metadata/button.json");
    expect(plan.prompt).toContain(".vortspec/metadata/toolbar.json");
    expect(plan.prompt).toContain("antiPatterns");
  });

  it("migrates a legacy record on read, and reports it as INCOMPLETE (tasks 1.2 + 1.5)", async () => {
    await mkdir(join(dir, ".vortspec/metadata"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec/metadata/button.json"),
      JSON.stringify({ name: "Button", summary: "A clickable action.", usage: ["for primary actions"], patterns: [], antiPatterns: ["don't use for navigation"] }),
      "utf8",
    );

    // What the legacy record DID say survives, in its new home.
    const record = await readComponentMetadata(dir, "Button");
    expect(record?.identity.description).toBe("A clickable action.");
    expect(record?.usage.useCases).toEqual(["for primary actions"]);
    expect(record?.origin).toBe("migrated");

    // …but having a file is no longer the same as being covered.
    const plan = await metadataPlan(dir);
    expect(plan.complete).toBe(0);
    expect(plan.incomplete.map((entry) => entry.name)).toEqual(["Button"]);
    expect(plan.incomplete[0].gaps).toContain("migrated");
    expect(plan.missing).toEqual(["Toolbar"]);
    // The generate affordance still covers it — a migrated record is exactly what needs regenerating.
    expect(plan.prompt).toContain(".vortspec/metadata/button.json");
  });

  it("counts a fully authored record as complete and drops it from the prompt", async () => {
    await mkdir(join(dir, ".vortspec/metadata"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec/metadata/button.json"),
      JSON.stringify({
        name: "Button",
        identity: { name: "Button", category: "atom", description: "A clickable action." },
        usage: {
          useCases: ["Primary page actions"],
          commonPatterns: [],
          antiPatterns: [{ scenario: "Navigation", reason: "not a link", alternative: "Use Link" }],
        },
        aiHints: { selectionCriteria: ["The action mutates state"] },
      }),
      "utf8",
    );

    const plan = await metadataPlan(dir);

    expect(plan.complete).toBe(1);
    expect(plan.incomplete).toEqual([]);
    expect(plan.prompt).not.toContain("button.json");
    expect(plan.prompt).toContain("toolbar.json");
  });

  it("discovery returns identity for the WHOLE roster, including components with no record (task 1.3)", async () => {
    await mkdir(join(dir, ".vortspec/metadata"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec/metadata/button.json"),
      JSON.stringify({ name: "Button", identity: { name: "Button", description: "A clickable action." } }),
      "utf8",
    );

    const discovery = await metadataDiscovery(dir);

    expect(discovery.map((entry) => entry.name).sort()).toEqual(["Button", "Toolbar"]);
    expect(discovery.find((entry) => entry.name === "Button")?.description).toBe("A clickable action.");
    // A component with no record is still listed — its absence is the useful fact.
    expect(discovery.find((entry) => entry.name === "Toolbar")?.description).toBe("");
  });

  it("emits an empty prompt when nothing is missing", () => {
    expect(buildMetadataPrompt([])).toContain("Components and their target files:");
  });
});
