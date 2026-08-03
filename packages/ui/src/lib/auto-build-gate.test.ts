import { describe, expect, it } from "vitest";
import { autoBuildGate } from "./auto-build-gate";

describe("autoBuildGate — refuse to build, but stay re-checkable", () => {
  it("proceeds for a supported framework on an extract source", () => {
    expect(autoBuildGate({ designSource: "figma", framework: "svelte" })).toEqual({
      kind: "proceed",
      claimProject: false,
    });
  });

  it("refuses on an unrecognized framework, naming what to do", () => {
    const gate = autoBuildGate({ designSource: "figma", framework: "brand-new-framework" });
    expect(gate.kind).toBe("setup-required");
    if (gate.kind !== "setup-required") throw new Error("expected setup-required");
    expect(gate.reason).toContain("/setup");
    expect(gate.reason).toContain("brand-new-framework");
  });

  it("refuses on an absent framework key, which is how a legacy config reads", () => {
    // Generating here means generating React into whatever the project actually is. A visible
    // "run /setup" beats that; Bumble's counter-argument (a permanent rebuild loop) applied to
    // the OLD path, which this gate removes by not starting the builder at all.
    expect(autoBuildGate({ designSource: "figma" }).kind).toBe("setup-required");
    expect(autoBuildGate(null).kind).toBe("setup-required");
  });

  it("does NOT claim the project when setup is required", () => {
    // The bug this asserts against: claiming marks the project handled for the session and
    // stops the poll, so a user who follows the notice and runs /setup is never re-checked and
    // auto-build never runs again for that project.
    const gate = autoBuildGate({ designSource: "figma", framework: "" });
    expect(gate.claimProject).toBe(false);
  });

  it("lets a corrected config proceed — the same project, re-evaluated", () => {
    // Models the sequence: unsupported → user runs /setup → next poll tick.
    const before = autoBuildGate({ designSource: "figma", framework: undefined });
    const after = autoBuildGate({ designSource: "figma", framework: "vue" });
    expect(before.kind).toBe("setup-required");
    expect(after.kind).toBe("proceed");
    // Nothing in the first verdict can prevent the second from being reached.
    expect(before.claimProject).toBe(false);
  });

  it("claims a consume source, which IS settled for good", () => {
    // The asymmetry is the point: consume never becomes buildable, so claiming and stopping
    // the poll is correct there and wrong for setup-required.
    for (const designSource of ["library", "enterprise"]) {
      const gate = autoBuildGate({ designSource, framework: "react" });
      expect(gate.kind).toBe("consume");
      expect(gate.claimProject).toBe(true);
    }
  });

  it("treats a consume source as consume even when the framework is unsupported", () => {
    // Consume is checked first: there is nothing to generate either way, and "run /setup"
    // would be the wrong instruction for a project that consumes a real library.
    expect(autoBuildGate({ designSource: "enterprise", framework: "nope" }).kind).toBe("consume");
  });

  it("is a pure function of the config — no hidden state between calls", () => {
    // The warning must be recomputed every tick rather than latched, so a stale notice cannot
    // survive over a project whose config is now fine.
    const unsupported = { designSource: "figma", framework: "nope" };
    const supported = { designSource: "figma", framework: "angular" };
    expect(autoBuildGate(unsupported).kind).toBe("setup-required");
    expect(autoBuildGate(supported).kind).toBe("proceed");
    expect(autoBuildGate(unsupported).kind).toBe("setup-required");
    expect(autoBuildGate(supported).kind).toBe("proceed");
  });
});
