import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collapseTokenToAlias } from "./token-parser";

/** Slice 5 (token-fidelity-sanitation): collapse a flattened semantic to an alias. */
describe("collapseTokenToAlias", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-collapse-"));
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\n", "utf8");
    await writeFile(
      join(dir, "tokens.css"),
      ":root {\n  --color-excellus-blue-500: #007AC3;\n  --color-surface-control: #007AC3;\n}\n",
      "utf8",
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("re-points the duplicate to alias the canonical token", async () => {
    await collapseTokenToAlias(dir, "color-surface-control", "color-excellus-blue-500");
    const css = await readFile(join(dir, "tokens.css"), "utf8");
    expect(css).toContain("--color-surface-control: var(--color-excellus-blue-500);");
    // The canonical primitive is untouched.
    expect(css).toContain("--color-excellus-blue-500: #007AC3;");
  });

  it("is a no-op when collapsing a token onto itself", async () => {
    await collapseTokenToAlias(dir, "color-surface-control", "color-surface-control");
    const css = await readFile(join(dir, "tokens.css"), "utf8");
    expect(css).toContain("--color-surface-control: #007AC3;");
  });
});
