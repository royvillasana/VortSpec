import { describe, expect, it } from "vitest";
import { compareVersions } from "./update-checker";

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.1.2", "0.1.10")).toBe(-1); // numeric, not lexical
  });

  it("treats equal versions as 0 and tolerates a leading v", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("v0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.2.0", "v0.1.0")).toBe(1);
  });

  it("ignores pre-release suffixes and missing segments", () => {
    expect(compareVersions("0.2.0-beta.1", "0.1.0")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
});
