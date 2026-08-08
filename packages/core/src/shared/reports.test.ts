import { describe, expect, it } from "vitest";
import { adoptionReport, tokenViolationReport } from "./reports";
import type { ComponentUsage, RelationshipGraph } from "./relationship-graph";
import type { GovernanceViolation } from "./governance-eval";

const STAMP = "2026-08-07T12:00:00.000Z";

const component = (over: Partial<ComponentUsage> & { name: string }): ComponentUsage => ({
  path: `src/components/${over.name}.tsx`,
  importedBy: [],
  uses: [],
  usedBy: [],
  importCount: 0,
  instanceCount: 0,
  adoption: "unimported",
  designSystem: true,
  ...over,
});

const graph = (components: ComponentUsage[]): RelationshipGraph => ({
  components,
  importedNeverRendered: [],
});

describe("adoption.md (task 4.5)", () => {
  const report = () =>
    adoptionReport({
      projectName: "Acme",
      generatedAt: STAMP,
      shadows: [
        { component: "Button", file: "src/views/Home.tsx", sharedTokens: ["color-primary", "radius-md", "spacing-4"], element: "button", overlap: 0.8 },
      ],
      graph: graph([
        component({ name: "Button", adoption: "adopted", importCount: 4, instanceCount: 12, efficiency: 3, tier: "atom" }),
        component({ name: "Badge", adoption: "imported-never-rendered", importCount: 1, importedBy: ["src/views/Home.tsx"], tier: "atom" }),
        component({ name: "Drawer", adoption: "unimported", tier: "organism" }),
        // A page node — present in the graph, never a "component" in this report.
        component({ name: "Home", designSystem: false, adoption: "adopted", importCount: 1, instanceCount: 1 }),
      ]),
    });

  it("counts only design-system components, not the pages that consume them", () => {
    expect(report()).toContain("3 design-system components");
  });

  it("reports adoption as a STATE, and never scores an unimported component", () => {
    // `efficiency` is instanceCount/importCount, which does not exist over zero imports. A report
    // that printed 0.00 there would rank a brand-new component as the worst-adopted thing in the
    // system — the exact misreading the AdoptionState split exists to prevent.
    const text = report();
    const drawerRow = text.split("\n").find((line) => line.includes("| Drawer |"));
    expect(drawerRow).toBeDefined();
    expect(drawerRow).not.toContain("0.00");
    expect(text).toContain("1 unimported");
  });

  it("leads the problems with imported-but-never-rendered, the unambiguous waste", () => {
    const text = report();
    expect(text.indexOf("## Imported but never rendered")).toBeLessThan(text.indexOf("## Unimported"));
    expect(text).toContain("| Badge | src/views/Home.tsx |");
  });

  it("lists shadow implementations with their evidence", () => {
    const text = report();
    expect(text).toContain("| Button | src/views/Home.tsx | 80% |");
    expect(text).toContain("color-primary, radius-md, spacing-4");
  });

  it("keeps a section that found nothing, saying so", () => {
    // A vanished section reads as "not checked". An empty one reads as "checked, clean".
    const text = adoptionReport({
      projectName: "Acme",
      generatedAt: STAMP,
      shadows: [],
      graph: graph([component({ name: "Button", adoption: "adopted", importCount: 1, instanceCount: 1, efficiency: 1 })]),
    });
    expect(text).toContain("## Shadow implementations");
    expect(text).toContain("_Nothing found._");
  });

  it("stamps when it was generated and says not to edit it", () => {
    expect(report()).toContain(STAMP);
    expect(report()).toContain("Do not hand-edit");
  });
});

describe("token-violations.md (task 4.6)", () => {
  const violation = (over: Partial<GovernanceViolation> & { component: string; rule: string }): GovernanceViolation => ({
    kind: "hierarchy-inversion",
    severity: "warning",
    file: `src/components/${over.component}.tsx`,
    message: "something is off",
    correction: "do this instead",
    ...over,
  });

  it("groups by component, because that is who fixes them", () => {
    const text = tokenViolationReport({
      projectName: "Acme",
      generatedAt: STAMP,
      violations: [
        violation({ component: "Callout", rule: "hierarchy/background-token-on-text", severity: "error" }),
        violation({ component: "Badge", rule: "elevation/shadow-outside-the-scale" }),
        violation({ component: "Callout", rule: "typography/composite-applied-piecemeal" }),
      ],
    });
    expect(text).toContain("## Badge");
    expect(text).toContain("## Callout");
    expect(text).toContain("3 violation(s) across 2 component(s) — 1 error(s), 2 warning(s)");
  });

  it("puts errors before warnings within a component", () => {
    const text = tokenViolationReport({
      projectName: "Acme",
      generatedAt: STAMP,
      violations: [
        violation({ component: "Callout", rule: "typography/composite-applied-piecemeal" }),
        violation({ component: "Callout", rule: "hierarchy/background-token-on-text", severity: "error" }),
      ],
    });
    expect(text.indexOf("hierarchy/background-token-on-text")).toBeLessThan(
      text.indexOf("typography/composite-applied-piecemeal"),
    );
  });

  it("gives the correction its own line", () => {
    // Buried mid-sentence, the fix reads as part of the complaint and gets skimmed past.
    const text = tokenViolationReport({
      projectName: "Acme",
      generatedAt: STAMP,
      violations: [violation({ component: "Callout", rule: "r", correction: "use the paired foreground token" })],
    });
    expect(text).toContain("  - Fix: use the paired foreground token");
  });

  it("REPORTS the rules that have not been judged instead of omitting them", () => {
    // Silently dropping the judgment rules would make the report read as a clean bill of health for
    // checks that never ran.
    const text = tokenViolationReport({
      projectName: "Acme",
      generatedAt: STAMP,
      violations: [],
      deferredRules: [{ component: "Badge", rule: "semantic-color/intent-token-used-decoratively" }],
    });
    expect(text).toContain("## Not yet judged");
    expect(text).toContain("neither passing nor failing");
    expect(text).toContain("| Badge | `semantic-color/intent-token-used-decoratively` |");
  });

  it("says so plainly when there is nothing to report", () => {
    const text = tokenViolationReport({ projectName: "Acme", generatedAt: STAMP, violations: [] });
    expect(text).toContain("0 violation(s)");
    expect(text).toContain("_Nothing found._");
    expect(text).not.toContain("## Not yet judged");
  });
});

describe("reduced coverage is reported, never counted as passing (task 6.7)", () => {
  const gap = {
    component: "Badge",
    file: "src/components/Badge.tsx",
    opaque: ["bg-primary", "text-lg"],
    properties: ["color", "background-color"],
    reason: "Theme-mapped utilities resolve their token at build time, so no rule can see which token landed on these properties.",
  };

  it("names the components the rules could not read, and why", () => {
    const text = tokenViolationReport({
      projectName: "Acme",
      generatedAt: STAMP,
      violations: [],
      coverageGaps: [gap],
    });
    expect(text).toContain("## Reduced coverage");
    expect(text).toContain("NOT reported as passing");
    expect(text).toContain("Badge");
    expect(text).toContain("bg-primary");
  });

  it("does not add the section when every component was readable", () => {
    const text = tokenViolationReport({ projectName: "Acme", generatedAt: STAMP, violations: [] });
    expect(text).not.toContain("## Reduced coverage");
  });

  it("keeps a clean report honest — zero violations plus a gap is not a pass", () => {
    // The distinction the whole task exists for: "we checked and it is fine" versus "we could not
    // check". A report showing only "0 violations" would collapse them.
    const text = tokenViolationReport({
      projectName: "Acme",
      generatedAt: STAMP,
      violations: [],
      coverageGaps: [gap],
    });
    expect(text).toContain("0 violation(s)");
    expect(text).toContain("## Reduced coverage");
  });
});
