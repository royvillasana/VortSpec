import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMetadataComplete } from "@vortspec/core/component-metadata";
import { readComponentMetadata, readMetadataFor, metadataStatus } from "./component-metadata";

/**
 * One metadata record, two readers — OpenSpec change: agentic-design-system, task 1.10.
 *
 * The two claims group 1 has to make good on:
 *   1. Storybook's docs page renders EQUIVALENTLY from the new source — i.e. every section the old
 *      co-located `<Name>.metadata.ts` fed is still reachable from `.vortspec/metadata/<name>.json`.
 *   2. A project with NO Storybook can have complete metadata — the record stopped being a Storybook
 *      deliverable, which is the whole point of moving it.
 */

let dir = "";

/** The record shape `.storybook/ComponentDocs` resolves and renders. */
const RECORD = {
  name: "Accordion",
  identity: {
    name: "Accordion",
    category: "molecule",
    type: "interactive",
    description: "Collapsible sections.",
    importPath: "@/components/Accordion/Accordion",
  },
  usage: {
    useCases: ["Progressive disclosure"],
    commonPatterns: [{ name: "FAQ", description: "One open", code: "<Accordion items={faqs} />" }],
    antiPatterns: [{ scenario: "Side-by-side comparison", reason: "hides differences", alternative: "Use Tabs" }],
  },
  variants: [{ axis: "size", value: "sm", purpose: "Dense sidebar lists" }],
  props: [{ name: "items", type: "AccordionItem[]", description: "Panels", required: true }],
  composition: {
    itemShape: [{ field: "title", type: "string", required: true, description: "Trigger label" }],
    slots: [],
    worksWith: ["Card"],
  },
  behavior: { states: [{ state: "expanded", description: "Panel visible" }], interactions: ["Enter toggles"] },
  accessibility: { role: "region", keyboard: "Enter/Space", screenReader: "announces state", wcag: "2.1 AA", notes: [] },
  designTokens: {
    colors: [{ role: "border", token: "color-border-subtle", value: "#E5E7EB" }],
    typography: [],
    spacing: [{ role: "padding", token: "spacing-4", value: "16px" }],
    shadows: [],
    radius: [{ role: "container", token: "radius-md", value: "8px" }],
  },
  aiHints: {
    context: "Renders its own headings.",
    selectionCriteria: ["Sections are independent rather than alternatives"],
    keywords: ["accordion"],
    generationRules: ["Stable key per item"],
  },
};

async function project(options: { withStorybook: boolean }): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "component_dir: src/components\n", "utf8");
  await writeFile(
    join(dir, ".sdd-de/components.json"),
    JSON.stringify([{ name: "Accordion", level: "molecule", figmaNodeId: "CK_ACC" }]),
    "utf8",
  );
  await writeFile(join(dir, "src/components/Accordion.tsx"), "export const Accordion = () => <div/>;\n", "utf8");
  if (options.withStorybook) {
    await mkdir(join(dir, ".storybook"), { recursive: true });
    await writeFile(join(dir, ".storybook/ComponentDocs.tsx"), "// shared docs renderer\n", "utf8");
    await writeFile(join(dir, "src/components/Accordion.stories.tsx"), "export default {};\n", "utf8");
  }
  // A synced project: the reconcile cache is where the roster's durable Figma key comes from.
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await writeFile(
    join(dir, ".vortspec/figma-components.json"),
    JSON.stringify([{ name: "Accordion", isSet: true, variants: ["size"], key: "CK_ACC" }]),
    "utf8",
  );
  await mkdir(join(dir, ".vortspec/metadata"), { recursive: true });
  await writeFile(join(dir, ".vortspec/metadata/accordion.json"), JSON.stringify(RECORD), "utf8");
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-meta-consolidation-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ComponentDocs renders equivalently from the new source (task 1.10)", () => {
  /** Every section the docs page draws, and where it now reads it from. */
  const SECTIONS: { section: string; read: (r: NonNullable<Awaited<ReturnType<typeof readComponentMetadata>>>) => unknown }[] = [
    { section: "Component Identity", read: (r) => r.identity.description },
    { section: "When to use this", read: (r) => r.usage.useCases[0] },
    { section: "Variants", read: (r) => r.variants[0]?.purpose },
    { section: "Props", read: (r) => r.props[0]?.name },
    { section: "Item Shape", read: (r) => r.composition?.itemShape[0]?.field },
    { section: "Common Patterns", read: (r) => r.usage.commonPatterns[0]?.code },
    { section: "Anti-Patterns", read: (r) => r.usage.antiPatterns[0]?.alternative },
    { section: "States & Behaviour", read: (r) => r.behavior?.states[0]?.state },
    { section: "Accessibility", read: (r) => r.accessibility?.role },
    { section: "Design Tokens", read: (r) => r.designTokens?.colors[0]?.value },
    { section: "AI Generation Hints", read: (r) => r.aiHints?.generationRules[0] },
  ];

  it("every docs section still has its data in the JSON record", async () => {
    await project({ withStorybook: true });
    const record = await readComponentMetadata(dir, "Accordion");
    expect(record).not.toBeNull();
    for (const { section, read } of SECTIONS) {
      expect(read(record!), `${section} lost its data in the move`).toBeTruthy();
    }
  });

  it("gains the two sections the co-located file never had", async () => {
    // Variant PURPOSE and selection criteria are what the old flat schema had no place for, and
    // they are the fields that decide which component and which variant get generated.
    await project({ withStorybook: true });
    const record = await readComponentMetadata(dir, "Accordion");
    expect(record!.variants[0].purpose).toBe("Dense sidebar lists");
    expect(record!.aiHints?.selectionCriteria).toEqual(["Sections are independent rather than alternatives"]);
  });

  it("resolves by the lowercased component name, the way ComponentDocs looks it up", async () => {
    await project({ withStorybook: true });
    await expect(readFile(join(dir, ".vortspec/metadata/accordion.json"), "utf8")).resolves.toContain("Accordion");
    expect(await readComponentMetadata(dir, "Accordion")).not.toBeNull();
  });
});

describe("a project with no Storybook has complete metadata (task 1.10)", () => {
  it("is complete without a .storybook directory, a story file, or a docs renderer", async () => {
    // The record stopped being a Storybook deliverable. If completeness still depended on Storybook,
    // the consolidation would have moved the file without moving the ownership.
    await project({ withStorybook: false });

    const status = await metadataStatus(dir);

    expect(status.total).toBe(1);
    expect(status.complete).toBe(1);
    expect(status.incomplete).toEqual([]);
    expect(status.missing).toEqual([]);
    const record = await readComponentMetadata(dir, "Accordion");
    expect(isMetadataComplete(record!)).toBe(true);
  });

  it("still enriches from the roster with no Storybook in sight", async () => {
    await project({ withStorybook: false });
    const records = await readMetadataFor(dir, ["Accordion"]);
    // The Figma reference is merged on read, not authored into the file.
    expect(records.get("accordion")?.identity.figmaNode).toBe("CK_ACC");
  });
});
