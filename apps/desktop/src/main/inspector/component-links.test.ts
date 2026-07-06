import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorComponents } from "./component-reader";

/** A project with a component, its spec, and a visual-verify report. */
async function scaffold(dir: string, opts: { report?: string; spec?: boolean }): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "component_dir: src\n", "utf8");
  await writeFile(
    join(dir, ".sdd-de/components.json"),
    JSON.stringify([{ name: "Button", level: "atom" }]),
    "utf8",
  );
  await writeFile(join(dir, "src/Button.tsx"), "export const Button = () => null;\n", "utf8");
  if (opts.spec) {
    await mkdir(join(dir, "specs", "button"), { recursive: true });
    await writeFile(join(dir, "specs/button/spec.md"), "# Button spec\n", "utf8");
  }
  if (opts.report !== undefined) {
    await mkdir(join(dir, "specs", "button"), { recursive: true });
    await writeFile(join(dir, "specs/button/visual-verify-report.md"), opts.report, "utf8");
  }
}

describe("getInspectorComponents — spec + report links", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-links-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("links the spec and report when both exist and marks verified", async () => {
    await scaffold(dir, { spec: true, report: "All checks passed. status: resolved\n" });
    const { components } = await getInspectorComponents(dir);
    const btn = components.find((c) => c.name === "Button");
    expect(btn?.specPath).toBe("specs/button/spec.md");
    expect(btn?.reportPath).toBe("specs/button/visual-verify-report.md");
    expect(btn?.status).toBe("verified");
  });

  it("surfaces has-issues status with issue titles from an open report", async () => {
    await scaffold(dir, {
      spec: true,
      report: "status: open\n\n### D2 Contrast too low\n\n### D3 Missing focus ring\n",
    });
    const { components } = await getInspectorComponents(dir);
    const btn = components.find((c) => c.name === "Button");
    expect(btn?.status).toBe("has-issues");
    expect(btn?.issues).toEqual(["D2 Contrast too low", "D3 Missing focus ring"]);
    expect(btn?.reportPath).toBe("specs/button/visual-verify-report.md");
  });

  it("returns null links and built status when no spec/report exist", async () => {
    await scaffold(dir, {});
    const { components } = await getInspectorComponents(dir);
    const btn = components.find((c) => c.name === "Button");
    expect(btn?.specPath).toBeNull();
    expect(btn?.reportPath).toBeNull();
    expect(btn?.status).toBe("built");
  });
});
