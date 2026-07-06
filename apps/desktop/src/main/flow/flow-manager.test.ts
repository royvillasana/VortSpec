import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
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
    // The last required stage before commit is sync — approving it completes the flow.
    const required = flow.definitions.filter((d) => !d.optional).map((d) => d.id);
    expect(required).toEqual(["design-system", "components", "visual-verify", "sync"]);
  });
});
