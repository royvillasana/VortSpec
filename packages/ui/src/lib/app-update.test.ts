import { describe, expect, it } from "vitest";
import type { UpdateInfo } from "@vortspec/core/update";
import { shouldPromptForUpdate, toCheckState } from "./app-update";

const AVAILABLE: UpdateInfo = {
  current: "0.1.34",
  latest: "0.1.35",
  hasUpdate: true,
  reachable: true,
  releaseUrl: "https://example/rel",
  downloadUrl: "https://example/arm.dmg",
  downloadArch: "arm64",
  checkedAt: 1_700_000_000_000,
};

describe("shouldPromptForUpdate", () => {
  it("prompts for an available update that was never dismissed", () => {
    expect(shouldPromptForUpdate(AVAILABLE, null)).toBe(true);
  });

  it("stays quiet for the version the user dismissed", () => {
    expect(shouldPromptForUpdate(AVAILABLE, "0.1.35")).toBe(false);
  });

  it("speaks up again when something newer than the dismissed version ships", () => {
    // The reason dismissal stores a version rather than a boolean: the
    // suppression has to expire by itself.
    expect(shouldPromptForUpdate({ ...AVAILABLE, latest: "0.1.36" }, "0.1.35")).toBe(true);
  });

  it("never prompts when there is no update, or no result at all", () => {
    expect(shouldPromptForUpdate({ ...AVAILABLE, hasUpdate: false }, null)).toBe(false);
    expect(shouldPromptForUpdate({ ...AVAILABLE, hasUpdate: false, latest: null }, null)).toBe(false);
    expect(shouldPromptForUpdate(null, null)).toBe(false);
  });

  it("never prompts on an unreachable check, dismissed or not", () => {
    const offline: UpdateInfo = {
      ...AVAILABLE,
      hasUpdate: false,
      reachable: false,
      latest: null,
    };
    expect(shouldPromptForUpdate(offline, null)).toBe(false);
    expect(shouldPromptForUpdate(offline, "0.1.35")).toBe(false);
  });
});

describe("toCheckState", () => {
  it("reports an available update", () => {
    expect(toCheckState(AVAILABLE)).toEqual({ kind: "available", info: AVAILABLE });
  });

  it("reports current, naming the version checked against", () => {
    const current = { ...AVAILABLE, current: "0.1.35", hasUpdate: false };
    expect(toCheckState(current)).toEqual({ kind: "current", latest: "0.1.35" });
  });

  it("reports unreachable rather than current when the check never landed", () => {
    // The whole point of the `reachable` field: both of these carry
    // hasUpdate: false, and only one of them means "you are up to date".
    const offline: UpdateInfo = { ...AVAILABLE, hasUpdate: false, reachable: false, latest: null };
    expect(toCheckState(offline)).toEqual({ kind: "unreachable" });
    expect(toCheckState({ ...AVAILABLE, hasUpdate: false }).kind).toBe("current");
  });

  it("does not claim an update when reachable but latest is missing", () => {
    const odd = { ...AVAILABLE, hasUpdate: true, latest: null };
    expect(toCheckState(odd)).toEqual({ kind: "current", latest: "0.1.34" });
  });
});
