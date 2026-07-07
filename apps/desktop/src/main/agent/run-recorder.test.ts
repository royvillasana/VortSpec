import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newAccumulator, recordRun, runTitle, readLastRun, writeLastRun, patchLastRun } from "./run-recorder";
import { runSummarySchema } from "../../shared/flow";

describe("run-recorder", () => {
  it("titles slash-command runs and truncates plain prompts", () => {
    expect(runTitle("/visual-verify\n\nRun the skill…")).toBe("Visual verify");
    expect(runTitle("Read .sdd-de/project.yaml and implement Button")).toContain("Read .sdd-de");
  });

  describe("recordRun", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "vortspec-rec-"));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("writes a valid RunSummary with outcome + artifact basenames", async () => {
      const acc = newAccumulator();
      acc.files.add("/proj/src/components/Button.tsx");
      acc.files.add("/proj/src/components/Card.tsx");
      await recordRun({ prompt: "/generate-artifacts", cwd: dir }, acc, 0);

      const files = (await readdir(join(dir, ".vortspec", "runs"))).filter((f) => f.endsWith(".json"));
      expect(files).toHaveLength(1);
      const parsed = runSummarySchema.safeParse(
        JSON.parse(await readFile(join(dir, ".vortspec", "runs", files[0]), "utf8")),
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.outcome).toBe("passed");
        expect(parsed.data.label).toBe("#1");
        expect(parsed.data.artifacts.sort()).toEqual(["Button.tsx", "Card.tsx"]);
      }
    });

    it("records cancelled (null exit) and failed (nonzero) outcomes and increments the label", async () => {
      await recordRun({ prompt: "run a", cwd: dir }, newAccumulator(), null);
      await recordRun({ prompt: "run b", cwd: dir }, newAccumulator(), 1);
      const runsDir = join(dir, ".vortspec", "runs");
      const outcomes = await Promise.all(
        (await readdir(runsDir)).map(async (f) =>
          JSON.parse(await readFile(join(runsDir, f), "utf8")),
        ),
      );
      const byLabel = new Map(outcomes.map((o) => [o.label, o.outcome]));
      expect(byLabel.get("#1")).toBe("cancelled");
      expect(byLabel.get("#2")).toBe("failed");
    });
  });

  describe("last-run pointer", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "vortspec-last-"));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("returns null when no last run exists", async () => {
      expect(await readLastRun(dir)).toBeNull();
    });

    it("round-trips a written record", async () => {
      await writeLastRun(dir, {
        sessionId: "s1",
        title: "Verify",
        kind: "verify",
        total: 3,
        status: "cancelled",
        updatedAt: "2026-07-07T00:00:00.000Z",
      });
      const got = await readLastRun(dir);
      expect(got?.sessionId).toBe("s1");
      expect(got?.status).toBe("cancelled");
    });

    it("merges patches without dropping prior fields", async () => {
      await patchLastRun(dir, { title: "Build & verify", kind: "pipeline", total: 5, status: "running" });
      await patchLastRun(dir, { sessionId: "sess-9" }); // later, once known
      await patchLastRun(dir, { status: "cancelled" }); // interrupted
      const got = await readLastRun(dir);
      expect(got?.title).toBe("Build & verify");
      expect(got?.kind).toBe("pipeline");
      expect(got?.total).toBe(5);
      expect(got?.sessionId).toBe("sess-9");
      expect(got?.status).toBe("cancelled");
    });
  });
});
