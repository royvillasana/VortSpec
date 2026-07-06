import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorTokens, setInspectorTokenValue } from "./token-parser";

/** Build a minimal project with a token file, config, and a component that uses a token. */
async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, ".sdd-de/project.yaml"),
    "token_file: tokens.css\ncomponent_dir: src\n",
    "utf8",
  );
  await writeFile(
    join(dir, "tokens.css"),
    ":root {\n  --color-primary: #2563EB; /* brand */\n  --radius-md: 8px;\n}\n",
    "utf8",
  );
  await writeFile(
    join(dir, "src/Button.tsx"),
    "export const s = { color: 'var(--color-primary)' };\n",
    "utf8",
  );
}

describe("token-parser — usage index + gated value write", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-tok-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("counts usage from component sources scanning var(--token)", async () => {
    const r = await getInspectorTokens(dir);
    const primary = r.tokens.find((t) => t.name === "color-primary");
    expect(primary?.uses).toBe(1);
    expect(r.usage["color-primary"]).toEqual([{ component: "Button" }]);
    // An unused token has zero uses.
    expect(r.tokens.find((t) => t.name === "radius-md")?.uses).toBe(0);
  });

  it("writes only the value of the named token, preserving name + comment", async () => {
    await setInspectorTokenValue(dir, "color-primary", "#FF0000");
    const css = await readFile(join(dir, "tokens.css"), "utf8");
    expect(css).toContain("--color-primary: #FF0000; /* brand */");
    // Other declarations untouched.
    expect(css).toContain("--radius-md: 8px;");
    const r = await getInspectorTokens(dir);
    expect(r.tokens.find((t) => t.name === "color-primary")?.resolvedValue).toBe("#FF0000");
  });

  it("is a no-op for an unknown token name", async () => {
    await setInspectorTokenValue(dir, "does-not-exist", "#000");
    const css = await readFile(join(dir, "tokens.css"), "utf8");
    expect(css).toContain("--color-primary: #2563EB;");
  });
});
