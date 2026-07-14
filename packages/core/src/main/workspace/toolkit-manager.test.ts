import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getToolkitStatus } from "./toolkit-manager";

// getToolkitStatus derives two signals from disk. `configured` is the gate the
// dashboard uses to decide "open the guided flow" vs "run intake first": an empty
// or partially-scaffolded folder must never jump straight into extraction.
describe("getToolkitStatus", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-toolkit-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports an empty folder as neither present nor configured", async () => {
    const status = await getToolkitStatus(dir);
    expect(status.present).toBe(false);
    expect(status.configured).toBe(false);
  });

  it("treats a set-up project (project.yaml) as present and configured", async () => {
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de", "project.yaml"), "framework: react\n", "utf8");
    const status = await getToolkitStatus(dir);
    expect(status.present).toBe(true);
    expect(status.configured).toBe(true);
  });

  it("treats a skills-only folder as present but NOT configured", async () => {
    // Toolkit skills scaffolded (e.g. a bare CLI install) but no intake yet — the
    // dashboard should route this to setup, not into component extraction.
    await mkdir(join(dir, ".sdd-de", "ai-specs", "skills"), { recursive: true });
    const status = await getToolkitStatus(dir);
    expect(status.present).toBe(true);
    expect(status.configured).toBe(false);
  });
});
