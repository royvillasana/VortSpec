import { describe, expect, it } from "vitest";
import { deriveProgress } from "./run-progress";
import { initialRun, type RunModel } from "./run-model";

function model(over: Partial<RunModel>): RunModel {
  return { ...initialRun, ...over };
}

describe("deriveProgress", () => {
  it("maps a build run to the Implementing stage from a written component file", () => {
    const m = model({
      status: "running",
      files: ["src/components/Modal.tsx"],
      messages: [{ id: "1", role: "assistant", text: "Implementing the Modal component." }],
    });
    const p = deriveProgress(m, "build");
    expect(p.stages.map((s) => s.id)).toEqual(["specs", "implement"]);
    expect(p.stages[p.currentIndex].id).toBe("implement");
    expect(p.legend).toMatch(/Implementing/);
    expect(p.fraction).toBeGreaterThan(0);
    expect(p.fraction).toBeLessThan(1);
  });

  it("detects the specs stage before any code is written", () => {
    const m = model({
      status: "running",
      files: ["specs/modal/modal-component-spec.md"],
    });
    const p = deriveProgress(m, "build");
    expect(p.stages[p.currentIndex].id).toBe("specs");
  });

  it("advances verify from visual QA to adversarial review", () => {
    const visual = deriveProgress(
      model({ status: "running", files: ["specs/button/visual-verify-report.md"] }),
      "verify",
    );
    expect(visual.stages[visual.currentIndex].id).toBe("visual");

    const adversarial = deriveProgress(
      model({
        status: "running",
        files: ["specs/button/visual-verify-report.md"],
        messages: [{ id: "1", role: "assistant", text: "Running /adversarial-review now." }],
      }),
      "verify",
    );
    expect(adversarial.stages[adversarial.currentIndex].id).toBe("adversarial");
  });

  it("counts pipeline components from verdict lines and reports a counter", () => {
    const m = model({
      status: "running",
      files: ["src/components/Card.tsx"],
      messages: [
        { id: "1", role: "assistant", text: "Button: PASS\nInput: ISSUES (2)\nWorking on Card…" },
      ],
    });
    const p = deriveProgress(m, "pipeline", { total: 4 });
    expect(p.counter).toEqual({ done: 2, total: 4 });
    expect(p.legend).toMatch(/component 3 of 4/);
    expect(p.fraction).toBeGreaterThan(0.4);
    expect(p.fraction).toBeLessThan(0.98 + 1e-9);
  });

  it("surfaces a Figma MCP blocker the user must resolve", () => {
    const p = deriveProgress(
      model({ status: "running", mcpErrors: ["Figma MCP not reachable"] }),
      "verify",
    );
    expect(p.blockers).toHaveLength(1);
    expect(p.blockers[0].title).toMatch(/Figma/);
    expect(p.blockers[0].tone).toBe("error");
  });

  it("surfaces a step error as a blocker", () => {
    const p = deriveProgress(
      model({ status: "error", result: { isError: true, text: "boom" } }),
      "build",
    );
    expect(p.blockers.some((b) => /error/i.test(b.title))).toBe(true);
  });

  it("reports full progress when done", () => {
    const p = deriveProgress(model({ status: "done" }), "verify");
    expect(p.fraction).toBe(1);
    expect(p.done).toBe(true);
    expect(p.legend).toBe("Done");
  });
});
