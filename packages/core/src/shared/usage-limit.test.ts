import { describe, it, expect } from "vitest";
import { detectUsageLimit } from "./usage-limit";

describe("detectUsageLimit", () => {
  it("detects the session limit and its reset label", () => {
    const r = detectUsageLimit("You've hit your session limit · resets 3:45pm");
    expect(r).not.toBeNull();
    expect(r!.scope).toBe("session");
    expect(r!.resetLabel).toBe("3:45pm");
    expect(r!.resetsAt).toBeUndefined();
  });

  it("detects weekly and Opus scopes", () => {
    expect(detectUsageLimit("You've hit your weekly limit · resets Mon 12:00am")!.scope).toBe("weekly");
    expect(detectUsageLimit("You've hit your Opus limit · resets 3:45pm")!.scope).toBe("opus");
  });

  it("handles the curly apostrophe and 'reset' without 's'", () => {
    const r = detectUsageLimit("You’ve hit your session limit, reset 6:30pm (Europe/Madrid)");
    expect(r!.scope).toBe("session");
    expect(r!.resetLabel).toBe("6:30pm");
  });

  it("parses the legacy pipe form into an epoch (seconds → ms)", () => {
    const r = detectUsageLimit("Claude AI usage limit reached|1751900000");
    expect(r!.scope).toBe("unknown");
    expect(r!.resetsAt).toBe(1751900000 * 1000);
  });

  it("keeps an explicit millisecond epoch as-is", () => {
    const r = detectUsageLimit("Claude AI usage limit reached|1751900000000");
    expect(r!.resetsAt).toBe(1751900000000);
  });

  it("falls back to unknown scope for a generic usage-limit message", () => {
    const r = detectUsageLimit("Error: usage limit reached, try again later");
    expect(r!.scope).toBe("unknown");
  });

  it("returns null for normal errors, retries, and empty text", () => {
    expect(detectUsageLimit("TypeError: cannot read property 'x' of undefined")).toBeNull();
    expect(detectUsageLimit("overloaded_error: the model is overloaded")).toBeNull();
    expect(detectUsageLimit("")).toBeNull();
    expect(detectUsageLimit(null)).toBeNull();
    expect(detectUsageLimit(undefined)).toBeNull();
  });
});
