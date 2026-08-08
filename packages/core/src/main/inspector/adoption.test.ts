import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { adoptionSummary } from "./adoption";
import { buildRelationshipIndex } from "./relationship-index";

let dir = "";
const write = async (relative: string, content: string) => {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content, "utf8");
};

/**
 * Button is rendered by Card (adopted); Badge is imported by a page that never renders it; Drawer is
 * imported by nothing.
 */
async function project(): Promise<void> {
  await write(
    ".sdd-de/project.yaml",
    "framework: react\nlanguage: typescript\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
  );
  await write("src/tokens.css", ":root { --color-primary: #1d4ed8; }\n");
  await write(
    ".sdd-de/components.json",
    JSON.stringify([{ name: "Button", level: "atom" }, { name: "Card", level: "molecule" }, { name: "Badge", level: "atom" }, { name: "Drawer", level: "organism" }]),
  );
  await write("src/components/Button.tsx", "export const Button = () => <button/>;");
  await write("src/components/Badge.tsx", "export const Badge = () => <span/>;");
  await write("src/components/Drawer.tsx", "export const Drawer = () => <aside/>;");
  await write(
    "src/components/Card.tsx",
    'import { Button } from "./Button";\nexport const Card = () => (<div><Button/></div>);',
  );
  await write(
    "src/views/Home.tsx",
    'import { Card } from "../components/Card";\nimport { Badge } from "../components/Badge";\nexport const Home = () => <Card/>;',
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-adoption-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the adoption summary the UI reads", () => {
  it("returns NULL when no index has been built", async () => {
    // Zeroes would say "nothing is unused" while meaning "we have not looked" — opposite claims.
    expect(await adoptionSummary(dir)).toBeNull();
  });

  it("separates imported-never-rendered from unimported", async () => {
    await buildRelationshipIndex(dir, { generatedAt: "2026-08-08T12:00:00.000Z" });
    const summary = (await adoptionSummary(dir))!;
    expect(summary.importedNeverRendered.map((r) => r.name)).toEqual(["Badge"]);
    expect(summary.unimported.map((r) => r.name)).toEqual(["Drawer"]);
    expect(summary.adopted.map((r) => r.name)).toContain("Button");
  });

  it("names the files that import but never render", async () => {
    await buildRelationshipIndex(dir, { generatedAt: "2026-08-08T12:00:00.000Z" });
    const summary = (await adoptionSummary(dir))!;
    expect(summary.importedNeverRendered[0]?.importedBy).toContain("src/views/Home.tsx");
  });

  it("counts only design-system components, never pages", async () => {
    // A page nothing renders is the top of the tree, not an adoption problem. Counting pages would
    // put every route into the unimported list.
    await buildRelationshipIndex(dir, { generatedAt: "2026-08-08T12:00:00.000Z" });
    const summary = (await adoptionSummary(dir))!;
    expect(summary.unimported.map((r) => r.name)).not.toContain("Home");
    expect(summary.total).toBe(4);
  });

  it("reads WITHOUT rebuilding — a deleted source does not change the answer", async () => {
    // The panel is a projection of the committed index, which is what makes it agree with
    // reports/adoption.md by construction.
    await buildRelationshipIndex(dir, { generatedAt: "2026-08-08T12:00:00.000Z" });
    const before = await adoptionSummary(dir);
    await rm(join(dir, "src/components/Drawer.tsx"));
    const after = await adoptionSummary(dir);
    expect(after?.unimported.map((r) => r.name)).toEqual(before?.unimported.map((r) => r.name));
  });

  it("flags the summary as STALE once the code has moved on", async () => {
    // A REAL stamp here, unlike the byte-stability tests: staleness compares the index's
    // `generatedAt` against source mtimes, so a fixed past stamp is stale the moment it is written.
    await buildRelationshipIndex(dir, { generatedAt: new Date().toISOString() });
    expect((await adoptionSummary(dir))?.stale).toBe(false);
    await write("src/components/Drawer.tsx", "export const Drawer = () => <aside data-x/>;");
    expect((await adoptionSummary(dir))?.stale).toBe(true);
  });

  it("degrades to null on a malformed artifact rather than throwing", async () => {
    await buildRelationshipIndex(dir, { generatedAt: "2026-08-08T12:00:00.000Z" });
    await write(".vortspec/ai/index.toon", "{ not toon");
    expect(await adoptionSummary(dir)).toBeNull();
  });
});
