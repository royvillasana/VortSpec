import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  convergenceIssues,
  buildReadinessReport,
  compileBlockers,
  type ContractIdentity,
  type FrameworkStatus,
} from "./readiness";

const BUTTON: ContractIdentity = {
  name: "Button",
  variants: ["primary", "secondary"],
  props: [{ name: "variant", type: "string", default: "primary" }],
};

describe("computeReadiness (4.3 transition)", () => {
  it("is light-only before the framework component exists", () => {
    expect(computeReadiness(BUTTON)).toBe("light-only");
    expect(computeReadiness(BUTTON, { exists: false, harvestedVariants: ["primary", "secondary"] })).toBe("light-only");
  });

  it("stays light-only while any variant is unharvested", () => {
    expect(computeReadiness(BUTTON, { exists: true, harvestedVariants: ["primary"] })).toBe("light-only");
  });

  it("becomes framework-ready when it exists AND every variant is harvested", () => {
    expect(computeReadiness(BUTTON, { exists: true, harvestedVariants: ["primary", "secondary"] })).toBe("framework-ready");
  });

  it("treats a no-variant component as a single implicit 'default' cell", () => {
    const plain: ContractIdentity = { name: "Divider", variants: [] };
    expect(computeReadiness(plain, { exists: true, harvestedVariants: [] })).toBe("light-only");
    expect(computeReadiness(plain, { exists: true, harvestedVariants: ["default"] })).toBe("framework-ready");
  });
});

describe("convergenceIssues (4.5 identity assertion)", () => {
  it("is vacuously converged until the framework component exists", () => {
    expect(convergenceIssues(BUTTON)).toEqual([]);
    expect(convergenceIssues(BUTTON, { exists: true, harvestedVariants: [] })).toEqual([]); // no parsed identity yet
  });

  it("passes when the framework identity matches the contract", () => {
    const fw: FrameworkStatus = { exists: true, harvestedVariants: ["primary", "secondary"], identity: BUTTON };
    expect(convergenceIssues(BUTTON, fw)).toEqual([]);
  });

  it("flags a missing variant, an extra prop, and a prop type mismatch", () => {
    const fw: FrameworkStatus = {
      exists: true,
      harvestedVariants: ["primary"],
      identity: { name: "Button", variants: ["primary"], props: [{ name: "variant", type: "number" }, { name: "loading", type: "boolean" }] },
    };
    const issues = convergenceIssues(BUTTON, fw);
    expect(issues.some((i) => i.includes('variant "secondary" missing'))).toBe(true);
    expect(issues.some((i) => i.includes('prop "loading" extra'))).toBe(true);
    expect(issues.some((i) => i.includes('prop "variant" type'))).toBe(true);
  });

  it("flags a name mismatch", () => {
    const fw: FrameworkStatus = { exists: true, harvestedVariants: [], identity: { name: "Btn", variants: ["primary", "secondary"] } };
    expect(convergenceIssues(BUTTON, fw).some((i) => i.includes("name:"))).toBe(true);
  });
});

describe("buildReadinessReport (4.4 / 4.6)", () => {
  const CARD: ContractIdentity = { name: "Card", variants: ["default"] };

  it("palette is usable immediately after extraction, even with everything light-only", () => {
    const report = buildReadinessReport([BUTTON, CARD]);
    expect(report.paletteUsable).toBe(true);
    expect(report.catchingUp).toEqual(["Button", "Card"]);
    expect(report.diverged).toEqual([]);
  });

  it("flips a component's readiness as its framework version lands + harvests", () => {
    const report = buildReadinessReport([BUTTON, CARD], {
      Button: { exists: true, harvestedVariants: ["primary", "secondary"], identity: BUTTON },
      Card: { exists: false, harvestedVariants: [] },
    });
    expect(report.components.find((c) => c.name === "Button")!.readiness).toBe("framework-ready");
    expect(report.catchingUp).toEqual(["Card"]);
  });

  it("surfaces drift in `diverged`", () => {
    const report = buildReadinessReport([BUTTON], {
      Button: { exists: true, harvestedVariants: ["primary", "secondary"], identity: { name: "Button", variants: ["primary"] } },
    });
    expect(report.diverged).toEqual(["Button"]);
  });
});

describe("compileBlockers (soft gate feed for group 5)", () => {
  it("returns the used components that are not yet framework-ready", () => {
    const report = buildReadinessReport([BUTTON, { name: "Card", variants: ["default"] }], {
      Button: { exists: true, harvestedVariants: ["primary", "secondary"], identity: BUTTON },
    });
    // Button is ready, Card is not; Hero isn't even in the contract → still a blocker
    expect(compileBlockers(["Button", "Card", "Hero", "Button"], report).sort()).toEqual(["Card", "Hero"]);
  });

  it("returns empty when every used component is framework-ready", () => {
    const report = buildReadinessReport([BUTTON], { Button: { exists: true, harvestedVariants: ["primary", "secondary"], identity: BUTTON } });
    expect(compileBlockers(["Button"], report)).toEqual([]);
  });
});
