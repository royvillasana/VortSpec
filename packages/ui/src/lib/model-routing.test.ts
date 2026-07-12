import { describe, it, expect } from "vitest";
import { routedModel, modelHonored } from "./model-routing";

describe("routedModel", () => {
  it("never sends a flag for the default (opus) tier", () => {
    expect(routedModel("opus")).toBeUndefined();
  });
  it("requests the cheaper tier alias when routing is available", () => {
    // vitest runs in node → no localStorage → routing is enabled by default.
    expect(routedModel("sonnet")).toBe("sonnet");
    expect(routedModel("haiku")).toBe("haiku");
  });
});

describe("modelHonored", () => {
  it("is honored when the session model matches the requested family", () => {
    expect(modelHonored("sonnet", "claude-sonnet-5")).toBe(true);
    expect(modelHonored("haiku", "claude-haiku-4-5-20251001")).toBe(true);
  });
  it("is NOT honored when the login coerced to a different model", () => {
    expect(modelHonored("sonnet", "claude-opus-4-8")).toBe(false);
    expect(modelHonored("haiku", "claude-sonnet-5")).toBe(false);
  });
  it("treats missing telemetry as honored (don't disable on no signal)", () => {
    expect(modelHonored("sonnet", undefined)).toBe(true);
    expect(modelHonored("sonnet", null)).toBe(true);
  });
});
