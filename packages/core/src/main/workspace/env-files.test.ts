import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getEnvStatus, createEnvFromExample } from "./env-files";

describe("env-files", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-env-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports a missing .env when only an example exists", async () => {
    await writeFile(join(dir, ".env.example"), "VITE_X=1\n");
    const s = getEnvStatus(dir);
    expect(s.hasEnv).toBe(false);
    expect(s.examples).toContain(".env.example");
  });

  it("reports hasEnv when .env exists", async () => {
    await writeFile(join(dir, ".env"), "X=1\n");
    expect(getEnvStatus(dir).hasEnv).toBe(true);
  });

  it("creates .env from an example", async () => {
    await writeFile(join(dir, ".env.example"), "VITE_X=placeholder\n");
    const r = await createEnvFromExample(dir, ".env.example");
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, ".env"))).toBe(true);
    expect(await readFile(join(dir, ".env"), "utf8")).toContain("VITE_X=placeholder");
  });

  it("never overwrites an existing .env", async () => {
    await writeFile(join(dir, ".env.example"), "new\n");
    await writeFile(join(dir, ".env"), "keepme\n");
    const r = await createEnvFromExample(dir, ".env.example");
    expect(r.ok).toBe(false);
    expect(await readFile(join(dir, ".env"), "utf8")).toBe("keepme\n");
  });

  it("flags placeholder and blank env vars by name (never values)", async () => {
    await writeFile(
      join(dir, ".env"),
      "VITE_SUPABASE_URL=https://<project-ref>.supabase.co\nVITE_KEY=\nGOOD=realvalue\n# COMMENT=x\n",
    );
    const s = getEnvStatus(dir);
    expect(s.hasEnv).toBe(true);
    expect(s.placeholders).toContain("VITE_SUPABASE_URL"); // has < >
    expect(s.placeholders).toContain("VITE_KEY"); // blank
    expect(s.placeholders).not.toContain("GOOD");
  });

  it("refuses unknown example names (no path traversal)", async () => {
    const r = await createEnvFromExample(dir, "../../../etc/passwd");
    expect(r.ok).toBe(false);
    expect(existsSync(join(dir, ".env"))).toBe(false);
  });
});
