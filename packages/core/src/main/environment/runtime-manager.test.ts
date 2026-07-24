import { describe, it, expect } from "vitest";
import { prependManagedBin, MANAGED_BIN } from "./runtime-manager";

describe("prependManagedBin", () => {
  it("prepends the managed bin dir, idempotently", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    prependManagedBin(env);
    expect(env.PATH).toBe(`${MANAGED_BIN}:/usr/bin:/bin`);
    prependManagedBin(env); // already present → unchanged
    expect(env.PATH).toBe(`${MANAGED_BIN}:/usr/bin:/bin`);
  });

  it("handles an empty PATH", () => {
    const env: NodeJS.ProcessEnv = {};
    prependManagedBin(env);
    expect(env.PATH).toBe(MANAGED_BIN);
  });
});
