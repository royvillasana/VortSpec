import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseToon } from "@vortspec/core/toon";
import { GLOSSARY_PATH, collectGlossaryInput, writePropsGlossary } from "./props-glossary";
import { buildRelationshipIndex } from "./relationship-index";

let dir = "";
const write = async (relative: string, content: string) => {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content, "utf8");
};

/** Two components whose `size` prop disagrees: an enum on one, a number on the other. */
async function project(): Promise<void> {
  await write(
    ".sdd-de/project.yaml",
    "framework: react\nlanguage: typescript\nstyling: tailwind\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
  );
  await write("src/tokens.css", ":root { --color-primary: #1d4ed8; }\n");
  await write(".sdd-de/components.json", JSON.stringify([{ name: "Button" }, { name: "Icon" }]));
  await write(
    "src/components/Button.tsx",
    `import { cva } from "class-variance-authority";
export const buttonVariants = cva("", { variants: { size: { sm: "p-1", lg: "p-3" } }, defaultVariants: { size: "sm" } });
export const Button = () => <button/>;`,
  );
  await write("src/components/Icon.tsx", `export const Icon = () => <svg/>;`);
  // Icon declares `size` as a number in its metadata record — the conflict.
  await write(
    ".vortspec/metadata/icon.json",
    JSON.stringify({
      name: "Icon",
      identity: { name: "Icon", category: "atom", type: "display", description: "", importPath: "" },
      props: [{ name: "size", type: "number", description: "" }],
    }),
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-glossary-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("building the glossary from a real project (task 9b.1)", () => {
  it("merges DETECTED values with DECLARED types", async () => {
    // Neither source suffices alone: the roster knows the accepted values (read out of CVA) but
    // types them only as `enum`; the metadata record knows the TS type but lists no values.
    const inputs = await collectGlossaryInput(dir);
    const button = inputs.find((i) => i.component === "Button");
    expect(button?.props.find((p) => p.name === "size")?.values).toEqual(["sm", "lg"]);
    const icon = inputs.find((i) => i.component === "Icon");
    expect(icon?.props.find((p) => p.name === "size")?.type).toBe("number");
  });

  it("finds the conflict and writes the artifact", async () => {
    const { glossary, written } = await writePropsGlossary(dir, { generatedAt: "2026-08-07T12:00:00.000Z" });
    expect(written).toBe(GLOSSARY_PATH);
    expect(glossary.conflicts.map((c) => c.prop)).toEqual(["size"]);

    const parsed = parseToon(await readFile(join(dir, GLOSSARY_PATH), "utf8")) as Record<string, unknown>;
    expect((parsed.stats as Record<string, number>).conflicts).toBe(1);
  });

  it("writes NOTHING when there are no props to index", async () => {
    // An empty table reads as "checked, nothing shared", which is a different claim from "there was
    // nothing to index".
    const bare = await mkdtemp(join(tmpdir(), "vortspec-glossary-bare-"));
    try {
      const { written } = await writePropsGlossary(bare, { generatedAt: "2026-08-07T12:00:00.000Z" });
      expect(written).toBeNull();
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("is built by the index build itself", async () => {
    const result = await buildRelationshipIndex(dir, { generatedAt: "2026-08-07T12:00:00.000Z" });
    expect(result.written).toContain(GLOSSARY_PATH);
  });
});
