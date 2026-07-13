import { describe, it, expect } from "vitest";
import { sessionUsage, nextWarningThreshold, rearmedLastWarned } from "./usage-warn";
import type { UsageResult } from "./usage";

const usage = (limits: { label: string; percent: number; resetsAt: string | null }[]): UsageResult => ({
  available: true,
  headline: null,
  limits,
  note: null,
  raw: "",
  capturedAt: "",
  error: null,
});

describe("sessionUsage", () => {
  it("picks the session bar, not the weekly one", () => {
    const r = sessionUsage(
      usage([
        { label: "Current session", percent: 78, resetsAt: "3:45pm" },
        { label: "Current week (all models)", percent: 40, resetsAt: "Mon 2am" },
      ]),
    );
    expect(r).toEqual({ percent: 78, resetsAt: "3:45pm" });
  });

  it("returns null when there's no session bar", () => {
    expect(sessionUsage(usage([{ label: "Current week (all models)", percent: 40, resetsAt: null }]))).toBeNull();
  });
});

describe("nextWarningThreshold", () => {
  it("warns at 75 the first time it's crossed", () => {
    expect(nextWarningThreshold(76, 0)).toBe(75);
  });
  it("warns again at each +10% step", () => {
    expect(nextWarningThreshold(86, 75)).toBe(85);
    expect(nextWarningThreshold(96, 85)).toBe(95);
  });
  it("surfaces the most urgent threshold when usage jumps several steps", () => {
    expect(nextWarningThreshold(96, 0)).toBe(95);
  });
  it("returns null when nothing new has been crossed", () => {
    expect(nextWarningThreshold(80, 75)).toBeNull();
    expect(nextWarningThreshold(50, 0)).toBeNull();
    expect(nextWarningThreshold(95, 95)).toBeNull();
  });
});

describe("rearmedLastWarned", () => {
  it("re-arms from zero once a new session drops below the first threshold", () => {
    expect(rearmedLastWarned(12, 95)).toBe(0);
  });
  it("keeps the tracker while still above the first threshold", () => {
    expect(rearmedLastWarned(80, 75)).toBe(75);
  });
});
