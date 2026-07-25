import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareViteStamp } from "./dev-server";

let dir: string;
let stub: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vs-devstamp-"));
  // A stand-in for the shipped bundle, pointed at via the env override.
  stub = join(dir, "stub-stamp.mjs");
  await writeFile(stub, "export const vortspecSourceStamp = () => ({ name: 'stub' });\n", "utf8");
  process.env.VORTSPEC_STAMP_BUNDLE = stub;
});
afterEach(async () => {
  delete process.env.VORTSPEC_STAMP_BUNDLE;
  await rm(dir, { recursive: true, force: true });
});

async function pkg(content: object): Promise<string> {
  const proj = await mkdtemp(join(tmpdir(), "vs-proj-"));
  await writeFile(join(proj, "package.json"), JSON.stringify(content), "utf8");
  return proj;
}

describe("prepareViteStamp — dev-server injection", () => {
  it("materializes the stamp + wrapper and returns the vite command for a Vite app", async () => {
    const proj = await pkg({ devDependencies: { vite: "^5" }, scripts: { dev: "vite" } });
    const res = await prepareViteStamp(proj, "npm", "dev");
    expect(res).toEqual({ cmd: "npx", args: ["vite", "--config", ".vortspec/vite.stamp.mjs"] });
    // The bundle was copied into the project's .vortspec/ …
    expect(existsSync(join(proj, ".vortspec", "vortspec-stamp.mjs"))).toBe(true);
    // … and the wrapper points at it + loads the project's own config.
    const wrapper = await readFile(join(proj, ".vortspec", "vite.stamp.mjs"), "utf8");
    expect(wrapper).toContain('from "./vortspec-stamp.mjs"');
    expect(wrapper).toContain("loadConfigFromFile");
    await rm(proj, { recursive: true, force: true });
  });

  it("returns null (fall back to the plain script) for a non-Vite app — no .vortspec touched", async () => {
    const proj = await pkg({ devDependencies: { next: "14" }, scripts: { dev: "next dev" } });
    expect(await prepareViteStamp(proj, "npm", "dev")).toBeNull();
    expect(existsSync(join(proj, ".vortspec"))).toBe(false);
    await rm(proj, { recursive: true, force: true });
  });

  it("never throws on a broken/unreadable project (falls back)", async () => {
    // A project path with no package.json → JSON read fails → graceful null, no throw.
    const proj = await mkdtemp(join(tmpdir(), "vs-empty-"));
    await expect(prepareViteStamp(proj, "npm", "dev")).resolves.toBeNull();
    await rm(proj, { recursive: true, force: true });
  });
});
