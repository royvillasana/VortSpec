import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { cachedScan } from "./scan-cache";

const schema = z.object({ n: z.number() });

describe("cachedScan (Plan B2)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-scan-"));
    await writeFile(join(dir, "a.txt"), "one", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("computes on a miss and returns the cache on a hit (no recompute)", async () => {
    let calls = 0;
    const run = () => cachedScan(dir, "t", { files: ["a.txt"] }, async () => ({ n: ++calls }), schema);
    expect(await run()).toEqual({ n: 1 });
    expect(await run()).toEqual({ n: 1 }); // hit — compute did not run again
    expect(calls).toBe(1);
  });

  it("recomputes when an input file changes", async () => {
    let calls = 0;
    const run = () => cachedScan(dir, "t", { files: ["a.txt"] }, async () => ({ n: ++calls }), schema);
    await run();
    await writeFile(join(dir, "a.txt"), "two-different-length", "utf8"); // size changes → new fingerprint
    expect(await run()).toEqual({ n: 2 });
  });

  it("recomputes when the `extra` discriminator changes", async () => {
    let calls = 0;
    const run = (extra: string) =>
      cachedScan(dir, "t", { files: ["a.txt"], extra }, async () => ({ n: ++calls }), schema);
    await run("A");
    expect(await run("B")).toEqual({ n: 2 });
  });

  it("treats a schema-invalid cached payload as a miss (self-heals after a format change)", async () => {
    let calls = 0;
    const run = () => cachedScan(dir, "t", { files: ["a.txt"] }, async () => ({ n: ++calls }), schema);
    await run();
    // Corrupt the cached payload but keep the fingerprint intact.
    const path = join(dir, ".vortspec/index/t.json");
    const cached = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ fingerprint: cached.fingerprint, payload: { wrong: true } }), "utf8");
    expect(await run()).toEqual({ n: 2 }); // schema mismatch → recompute
  });
});
