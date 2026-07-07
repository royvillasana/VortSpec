import { describe, expect, it } from "vitest";
import { parseUsage } from "./usage-parser";

// Recorded real `/usage` output (Claude Code 2.x, subscription).
const SAMPLE = `You are currently using your subscription to power your Claude Code usage

Current session: 7% used · resets Jul 7 at 6:30pm (Europe/Madrid)
Current week (all models): 46% used · resets Jul 8 at 2am (Europe/Madrid)
Current week (Fable): 0% used

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai. Behaviors are independent characteristics, not a breakdown.

Last 24h · 2044 requests · 12 sessions
  98% of your usage came from subagent-heavy sessions
  Top skills: /visual-verify 1%, /storybook 1%`;

describe("parseUsage", () => {
  it("extracts every percentage bar with its reset string", () => {
    const p = parseUsage(SAMPLE);
    expect(p.limits).toEqual([
      { label: "Current session", percent: 7, resetsAt: "Jul 7 at 6:30pm (Europe/Madrid)" },
      { label: "Current week (all models)", percent: 46, resetsAt: "Jul 8 at 2am (Europe/Madrid)" },
      { label: "Current week (Fable)", percent: 0, resetsAt: null },
    ]);
  });

  it("captures the headline and the approximation note", () => {
    const p = parseUsage(SAMPLE);
    expect(p.headline).toMatch(/using your subscription/);
    expect(p.note).toMatch(/^Approximate/);
  });

  it("does not treat the contributing-breakdown percentages as limit bars", () => {
    const p = parseUsage(SAMPLE);
    // "98% of your usage came from…" is not "N% used" → excluded.
    expect(p.limits.every((l) => l.label.startsWith("Current"))).toBe(true);
  });

  it("degrades to empty limits on unfamiliar text, without throwing", () => {
    const p = parseUsage("Some unexpected output with no percentages");
    expect(p.limits).toEqual([]);
    expect(p.headline).toBeNull();
  });

  it("handles a decimal percentage", () => {
    const p = parseUsage("Current session: 12.5% used · resets tomorrow");
    expect(p.limits[0]).toEqual({ label: "Current session", percent: 12.5, resetsAt: "tomorrow" });
  });
});
