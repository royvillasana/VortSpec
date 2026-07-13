import { describe, it, expect } from "vitest";
import { parseResetEpoch, formatDuration } from "./RunLimitNotice";

describe("parseResetEpoch", () => {
  // A fixed "now": 2026-07-13 09:00 local time.
  const now = new Date(2026, 6, 13, 9, 0, 0, 0).getTime();

  it("resolves a same-day afternoon time to today", () => {
    const at = parseResetEpoch("3:45pm", now)!;
    const d = new Date(at);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(45);
    expect(d.getDate()).toBe(13);
    expect(at).toBeGreaterThan(now);
  });

  it("rolls a time that already passed today to tomorrow", () => {
    const at = parseResetEpoch("2am", now)!; // 2am < 9am now → tomorrow
    const d = new Date(at);
    expect(d.getHours()).toBe(2);
    expect(d.getDate()).toBe(14);
  });

  it("returns null for weekday/date forms (countdown not derivable)", () => {
    expect(parseResetEpoch("Mon 12:00am", now)).toBeNull();
    expect(parseResetEpoch("Jul 7 at 6:30pm", now)).toBeNull();
  });

  it("returns null for a missing/garbled label", () => {
    expect(parseResetEpoch(undefined, now)).toBeNull();
    expect(parseResetEpoch("soon", now)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(2 * 3600_000 + 14 * 60_000)).toBe("2h 14m");
    expect(formatDuration(3 * 60_000 + 20_000)).toBe("3m 20s");
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(-5000)).toBe("0s");
  });
});
