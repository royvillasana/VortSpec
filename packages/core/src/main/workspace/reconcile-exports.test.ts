import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileProjectExports } from "./reconcile-exports";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vs-reconcile-"));
  await mkdir(join(root, ".sdd-de"), { recursive: true });
  await writeFile(
    join(root, ".sdd-de", "project.yaml"),
    "framework: react\nlanguage: typescript\nstyling: tailwind\ntoken_file: src/styles/tokens.css\ncomponent_dir: src/components\n",
  );
  await mkdir(join(root, "src", "components", "atoms"), { recursive: true });
  await mkdir(join(root, "src", "components", "molecules"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("reconcileProjectExports", () => {
  it("fixes a named import of a default export and a default import of a named export", async () => {
    const atoms = join(root, "src", "components", "atoms");
    const mols = join(root, "src", "components", "molecules");
    await writeFile(join(atoms, "icon.tsx"), "const Icon = () => null;\nexport default Icon;\n");
    await writeFile(join(atoms, "button.tsx"), "export const Button = () => null;\n");
    // Story imports the default export as named → should become a default import.
    await writeFile(join(atoms, "icon.stories.tsx"), `import { Icon } from "./icon";\nexport default { component: Icon };\n`);
    // A molecule imports the named export as default → should become a named import.
    await writeFile(join(mols, "toolbar.tsx"), `import Button from "../atoms/button";\nexport const Toolbar = () => Button;\n`);

    const summary = await reconcileProjectExports(root);
    expect(summary.filesChanged).toBe(2);
    expect(await readFile(join(atoms, "icon.stories.tsx"), "utf8")).toContain(`import Icon from "./icon";`);
    expect(await readFile(join(mols, "toolbar.tsx"), "utf8")).toContain(`import { Button } from "../atoms/button";`);
  });

  it("is idempotent — a clean project is left unchanged", async () => {
    const atoms = join(root, "src", "components", "atoms");
    await writeFile(join(atoms, "button.tsx"), "export const Button = () => null;\n");
    await writeFile(join(atoms, "button.stories.tsx"), `import { Button } from "./button";\nexport default { component: Button };\n`);
    const summary = await reconcileProjectExports(root);
    expect(summary.filesChanged).toBe(0);
  });
});
