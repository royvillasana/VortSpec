import { describe, expect, it } from "vitest";
import { autoBuildGate, unbuiltComponents} from "./auto-build-gate";

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

describe("what the auto-builder considers unbuilt", () => {
  it("builds Figma-designed components when the coded roster is EMPTY", () => {
    // The bug: a freshly extracted Figma project has an empty coded roster by definition, so the
    // old `components.filter(status === "unknown")` returned [], auto-build concluded "design
    // system not created yet", and polled forever while 51 components sat in `figmaOnly`.
    const result = unbuiltComponents({
      components: [],
      figmaOnly: [{ name: "Button" }, { name: "Card" }, { name: "Alert" }],
    });
    expect(result.map((c) => c.name)).toEqual(["Button", "Card", "Alert"]);
  });

  it("still builds coded components whose status is unknown", () => {
    const result = unbuiltComponents({
      components: [{ name: "Badge", level: "atom", status: "unknown" }],
      figmaOnly: [],
    });
    expect(result).toEqual([{ name: "Badge", level: "atom", status: "unknown" }]);
  });

  it("does not rebuild a component that is already coded", () => {
    // Building it twice would overwrite the first build — an expensive way to find a reconciler bug.
    const result = unbuiltComponents({
      components: [{ name: "Button", level: "atom", status: "unknown" }],
      figmaOnly: [{ name: "button" }, { name: "Card" }],
    });
    expect(result.map((c) => c.name)).toEqual(["Button", "Card"]);
  });

  it("matches names across casing and separators", () => {
    const result = unbuiltComponents({
      components: [{ name: "close-button", status: "unknown" }],
      figmaOnly: [{ name: "Close Button" }],
    });
    expect(result).toHaveLength(1);
  });

  it("gives a Figma component NO invented tier", () => {
    // Figma records no atomic level. Faking one would sort it into the wrong build chunk.
    expect(unbuiltComponents({ components: [], figmaOnly: [{ name: "Button" }] })[0]?.level).toBeNull();
  });

  it("ignores a blank name and a missing figmaOnly", () => {
    expect(unbuiltComponents({ components: [], figmaOnly: [{ name: "  " }] })).toEqual([]);
    expect(unbuiltComponents({ components: [] })).toEqual([]);
    expect(unbuiltComponents(null)).toEqual([]);
  });

  it("reports nothing to build for a design system that is fully built", () => {
    // `status: "unknown"` is the unbuilt marker; a built component must not be rebuilt on every poll.
    expect(
      unbuiltComponents({ components: [{ name: "Button", status: "passed" }], figmaOnly: [] }),
    ).toEqual([]);
  });
});
