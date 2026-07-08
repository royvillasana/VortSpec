import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRunHistory } from "./history-reader";

describe("history-reader", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-hist-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("synthesizes the current flow as a run entry for a fresh project", async () => {
    const { runs } = await getRunHistory(dir);
    expect(runs).toHaveLength(1);
    const current = runs[0];
    expect(current.id).toBe("current");
    expect(current.outcome).toBe("in-progress");
    expect(current.stages.length).toBeGreaterThan(0);
    expect(current.stages.every((s) => s.status === "pending")).toBe(true);
  });

  it("reports file-derived living status and never a terminal 'passed'", async () => {
    // Scaffold: 1 token, 2 components (one built, one detected-only), no manifest.
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await mkdir(join(dir, "src", "components"), { recursive: true });
    await writeFile(
      join(dir, ".sdd-de/project.yaml"),
      "token_file: src/tokens.css\ncomponent_dir: src/components\n",
      "utf8",
    );
    await writeFile(join(dir, "src/tokens.css"), ":root {\n  --color-primary: #7C6FF0;\n}\n", "utf8");
    await writeFile(
      join(dir, ".sdd-de/components.json"),
      JSON.stringify([
        { name: "Button", level: "atom" },
        { name: "Modal", level: "organism" },
      ]),
      "utf8",
    );
    // Only Button has a source file → built; Modal stays detected.
    await writeFile(join(dir, "src/components/Button.tsx"), "export const Button = () => null;\n", "utf8");

    const { runs } = await getRunHistory(dir);
    const current = runs[0];
    expect(current.outcome).toBe("in-progress"); // never "passed"
    const components = current.stages.find((s) => s.name === "Components");
    expect(components?.decision).toBe("1/2 built");
    const foundation = current.stages.find((s) => s.name === "Foundation");
    expect(foundation?.status).toBe("done");
  });

  it("includes valid recorded runs from .vortspec/runs and skips malformed ones", async () => {
    await mkdir(join(dir, ".vortspec", "runs"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec", "runs", "r1.json"),
      JSON.stringify({
        id: "r1",
        label: "#1",
        title: "Prior run",
        outcome: "passed",
        updatedAt: "2026-01-01T00:00:00.000Z",
        stages: [{ name: "Spec", decision: "approved", status: "done" }],
        artifacts: ["component-spec.md"],
      }),
      "utf8",
    );
    await writeFile(join(dir, ".vortspec", "runs", "bad.json"), "{ not json", "utf8");

    const { runs } = await getRunHistory(dir);
    // current flow + one valid recorded run (malformed skipped)
    expect(runs.map((r) => r.id)).toEqual(["current", "r1"]);
    expect(runs[1].title).toBe("Prior run");
  });
});
