import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ScaffoldError, scaffoldComponent, verifyScaffold } from "./scaffold";
import { metadataStatus } from "./component-metadata";

let dir = "";
const write = async (relative: string, content: string) => {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content, "utf8");
};

const project = (designSource = "figma", styling = "tailwind") =>
  write(
    ".sdd-de/project.yaml",
    `framework: react\nlanguage: typescript\nstyling: ${styling}\ndesign_source: ${designSource}\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n`,
  );

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-scaffold-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scaffolding into a project (task 6.2)", () => {
  it("writes the file set from the project's own config", async () => {
    const result = await scaffoldComponent(dir, { name: "Callout", tier: "molecule" });
    expect(result.written).toEqual([
      "src/components/Callout.tsx",
      "src/components/Callout.variants.ts",
      "src/components/Callout.test.tsx",
      ".vortspec/metadata/callout.json",
    ]);
  });

  it("never writes an empty file (task 6.3)", async () => {
    await scaffoldComponent(dir, { name: "Callout" });
    for (const path of (await scaffoldComponent(dir, { name: "Badge" })).written)
      expect((await readFile(join(dir, path), "utf8")).trim().length).toBeGreaterThan(0);
  });

  it("does NOT overwrite a file the model has already filled in", async () => {
    // Re-scaffolding must be safe. Clobbering here would destroy exactly the work the scaffold
    // exists to make possible.
    await scaffoldComponent(dir, { name: "Callout" });
    await write("src/components/Callout.tsx", "export const Callout = () => <div>real</div>;\n");
    const again = await scaffoldComponent(dir, { name: "Callout" });
    expect(again.written).toEqual([]);
    expect(again.skipped).toContain("src/components/Callout.tsx");
    expect(await readFile(join(dir, "src/components/Callout.tsx"), "utf8")).toContain("real");
  });
});

describe("determinism (task 6.6)", () => {
  it("produces the same paths on a second run", async () => {
    const first = await scaffoldComponent(dir, { name: "Callout" });
    await rm(join(dir, "src"), { recursive: true, force: true });
    await rm(join(dir, ".vortspec"), { recursive: true, force: true });
    const second = await scaffoldComponent(dir, { name: "Callout" });
    expect(second.written).toEqual(first.written);
  });

  it("reports a missing file as a SCAFFOLD failure, by name", async () => {
    // The whole point is attribution: a missing `.variants.ts` currently looks like the model wrote a
    // worse component, and the two are fixed in completely different places.
    const input = {
      name: "Callout",
      framework: "react" as const,
      language: "typescript" as const,
      styling: "tailwind" as const,
      componentDir: "src/components",
    };
    await scaffoldComponent(dir, { name: "Callout" });
    expect(await verifyScaffold(dir, input)).toEqual({ complete: true, missing: [] });

    await rm(join(dir, "src/components/Callout.variants.ts"));
    const after = await verifyScaffold(dir, input);
    expect(after.complete).toBe(false);
    expect(after.missing).toEqual(["src/components/Callout.variants.ts"]);
  });
});

describe("a consumed library is never scaffolded into (task 6.8)", () => {
  it("refuses by name rather than writing somewhere else", async () => {
    // Writing into a dependency is a local fork that the next install wipes. The caller asked for
    // something this project cannot do and needs to be told, not quietly redirected.
    await project("enterprise");
    await expect(scaffoldComponent(dir, { name: "Callout" })).rejects.toThrow(ScaffoldError);
    await expect(scaffoldComponent(dir, { name: "Callout" })).rejects.toThrow(/consumes its design system/);
  });

  it("writes NOTHING at all when it refuses", async () => {
    await project("library");
    const before = await snapshot(dir);
    await scaffoldComponent(dir, { name: "Callout" }).catch(() => undefined);
    expect(await snapshot(dir)).toEqual(before);
  });
});

describe("metadata coverage (tasks 6.5, 6.10)", () => {
  it("reports zero MISSING records for an all-scaffolded project", async () => {
    for (const name of ["Callout", "Badge", "Chip"]) await scaffoldComponent(dir, { name });
    await write(
      ".sdd-de/components.json",
      JSON.stringify([{ name: "Callout" }, { name: "Badge" }, { name: "Chip" }]),
    );
    const status = await metadataStatus(dir);
    expect(status.missing).toEqual([]);
  });

  it("counts those records as INCOMPLETE, not as documented", async () => {
    // A scaffolded record has an identity and nothing else. Counting it as complete would report a
    // project as documented on the strength of sentences nobody wrote.
    await scaffoldComponent(dir, { name: "Callout" });
    await write(".sdd-de/components.json", JSON.stringify([{ name: "Callout" }]));
    const status = await metadataStatus(dir);
    expect(status.complete).toBe(0);
    expect(status.incomplete.map((entry) => entry.name)).toEqual(["Callout"]);
  });
});

async function snapshot(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const here = join(path, entry.name);
      out.push(here);
      if (entry.isDirectory()) await walk(here);
    }
  };
  await walk(root);
  return out.sort();
}
