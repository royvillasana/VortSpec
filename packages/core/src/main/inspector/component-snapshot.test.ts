import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotComponent, restoreFiles } from "./component-reader";

describe("component snapshot / restore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-snap-"));
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "Button.tsx"), "export const Button = 1;\n", "utf8");
    // Lowercase variants sibling — must still be found from Button.tsx.
    await writeFile(join(dir, "src", "button.variants.ts"), "export const v = 'a';\n", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("captures the component file and its case-insensitive variants sibling", async () => {
    const snaps = await snapshotComponent(dir, "src/Button.tsx");
    expect(snaps.map((s) => s.path).sort()).toEqual(["src/Button.tsx", "src/button.variants.ts"]);
  });

  it("restores captured files verbatim (revert)", async () => {
    const snaps = await snapshotComponent(dir, "src/Button.tsx");
    // Simulate a modify run editing both files.
    await writeFile(join(dir, "src", "Button.tsx"), "export const Button = 999;\n", "utf8");
    await writeFile(join(dir, "src", "button.variants.ts"), "export const v = 'CHANGED';\n", "utf8");

    await restoreFiles(dir, snaps);

    expect(await readFile(join(dir, "src", "Button.tsx"), "utf8")).toBe("export const Button = 1;\n");
    expect(await readFile(join(dir, "src", "button.variants.ts"), "utf8")).toBe(
      "export const v = 'a';\n",
    );
  });
});
