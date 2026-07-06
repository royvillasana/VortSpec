import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFlow, setPublishTarget, setStageStatus, approveStage } from "./flow-manager";

describe("flow-manager — publish target + optional stages", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-flow-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists and round-trips the opt-in publish target", async () => {
    await setPublishTarget(dir, "https://github.com/me/repo");
    expect((await getFlow(dir)).state.publishRepoUrl).toBe("https://github.com/me/repo");
  });

  it("forward-migrates a legacy flow.json (drops unknown stages, keeps what still exists)", async () => {
    // A flow.json from an older stage set: a removed stage, an invalid current
    // stage, but a real design-manifest approval + publish target to preserve.
    await mkdir(join(dir, ".vortspec"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec", "flow.json"),
      JSON.stringify({
        currentStageId: "enrich-brief", // legacy id no longer in DEFAULT_FLOW
        publishRepoUrl: "https://github.com/me/repo",
        stages: [
          { id: "enrich-brief", status: "approved", updatedAt: "2026-01-01T00:00:00.000Z" },
          { id: "design-manifest", status: "approved", updatedAt: "2026-01-02T00:00:00.000Z" },
        ],
      }),
      "utf8",
    );

    const flow = await getFlow(dir);
    const ids = flow.state.stages.map((s) => s.id);
    // Unknown legacy stage is gone; every current stage id is present.
    expect(ids).not.toContain("enrich-brief");
    expect(ids).toEqual(flow.definitions.map((d) => d.id));
    // The real design-manifest approval survives.
    expect(flow.state.stages.find((s) => s.id === "design-manifest")?.status).toBe("approved");
    // Invalid currentStageId reset to a valid one; publish target preserved.
    expect(flow.definitions.some((d) => d.id === flow.state.currentStageId)).toBe(true);
    expect(flow.state.publishRepoUrl).toBe("https://github.com/me/repo");
  });

  it("clears the publish target on an empty/whitespace value", async () => {
    await setPublishTarget(dir, "https://github.com/me/repo");
    await setPublishTarget(dir, "   ");
    expect((await getFlow(dir)).state.publishRepoUrl).toBeUndefined();
  });

  it("preserves the publish target across other stage mutations (reconcile)", async () => {
    await setPublishTarget(dir, "https://github.com/me/repo");
    await setStageStatus(dir, "design-system", "running");
    await approveStage(dir, "design-system");
    expect((await getFlow(dir)).state.publishRepoUrl).toBe("https://github.com/me/repo");
  });

  it("marks only the commit stage optional (so the flow completes locally)", async () => {
    const flow = await getFlow(dir);
    const optional = flow.definitions.filter((d) => d.optional).map((d) => d.id);
    expect(optional).toEqual(["commit"]);
    // The last required stage before commit is the design manifest — approving it
    // completes the flow locally (only publish/commit remains, and it's optional).
    const required = flow.definitions.filter((d) => !d.optional).map((d) => d.id);
    expect(required).toEqual([
      "design-system",
      "components",
      "visual-verify",
      "sync",
      "design-manifest",
    ]);
  });
});
