import { test, expect } from "@playwright/experimental-ct-react";
import { AuditBanner } from "@vortspec/ui/AuditBanner";
import type { AuditFinding, DesignAudit } from "@vortspec/core/ipc";

/**
 * The Issues surface — OpenSpec change: agentic-design-system, task 4.8.
 *
 * Governance v2's intent findings sit beside the existence findings, filterable by kind, each
 * carrying its correction; and the deferred judgment checks are visible rather than folded away.
 */

const existence: DesignAudit = {
  findings: [
    {
      component: "Badge",
      file: "src/components/Badge.tsx",
      severity: "error",
      kind: "hardcoded-color",
      message: "#1d4ed8 is hardcoded where --color-primary exists.",
    },
  ],
  summary: { components: 2, findings: 1, drifted: 0 },
};

const governance: AuditFinding[] = [
  {
    component: "Callout",
    file: "src/components/Callout.tsx",
    severity: "error",
    kind: "hierarchy-inversion",
    message: "--color-surface-raised is a surface token but is applied to `color`.",
    rule: "hierarchy/background-token-on-text",
    correction: "Use the foreground token paired with this surface.",
  },
  {
    component: "Callout",
    file: "src/components/Callout.tsx",
    severity: "warning",
    kind: "typography-split",
    message: "`line-height` is a literal while font-size comes from tokens.",
    rule: "typography/composite-applied-piecemeal",
    correction: "Apply the whole type style from its tokens.",
  },
];

test("shows existence and intent findings together", async ({ mount }) => {
  // The mounted root IS the banner section, so banner-level text is asserted on `banner` itself —
  // `banner.getByTestId("audit-banner")` searches DESCENDANTS and would never match.
  const banner = await mount(<AuditBanner audit={existence} governance={governance} />);
  await expect(banner).toContainText("3 audit findings");
  await banner.getByRole("button", { name: /audit finding/ }).click();
  await expect(banner.getByTestId("audit-finding")).toHaveCount(3);
});

test("filters by kind", async ({ mount }) => {
  const banner = await mount(<AuditBanner audit={existence} governance={governance} />);
  await banner.getByRole("button", { name: /audit finding/ }).click();
  await banner.getByRole("button", { name: "hierarchy (1)" }).click();
  await expect(banner.getByTestId("audit-finding")).toHaveCount(1);
  await expect(banner.getByTestId("audit-finding")).toContainText("Callout");
  await banner.getByRole("button", { name: "all (3)" }).click();
  await expect(banner.getByTestId("audit-finding")).toHaveCount(3);
});

test("shows each correction on its own line", async ({ mount }) => {
  const banner = await mount(<AuditBanner audit={null} governance={governance} />);
  await banner.getByRole("button", { name: /audit finding/ }).click();
  await expect(banner.getByTestId("audit-correction")).toHaveCount(2);
  await expect(banner.getByTestId("audit-correction").first()).toContainText("Fix: Use the foreground token");
});

test("surfaces deferred checks instead of reading as clean", async ({ mount }) => {
  // "Nothing was found" and "some checks have not run" are different states. Collapsing them would
  // report a project as clean on the strength of checks nobody performed.
  const banner = await mount(<AuditBanner audit={null} governance={[]} deferred={2} />);
  await expect(banner).toContainText("2 not yet judged");
  await banner.getByRole("button", { name: /audit finding/ }).click();
  await expect(banner.getByTestId("audit-deferred")).toContainText("neither passing nor failing");
});

test("stays silent when there is nothing found and nothing deferred", async ({ mount }) => {
  // Asserted on the RENDERED CONTENT, not on `getByTestId("audit-banner")`: the banner is the mount
  // root, so that locator matches nothing whether the component rendered or returned null — it would
  // pass either way and prove nothing.
  const banner = await mount(<AuditBanner audit={null} governance={[]} deferred={0} />);
  await expect(banner.getByRole("button")).toHaveCount(0);
  await expect(banner).toBeEmpty();
});

test("links the generated reports", async ({ mount }) => {
  const opened: string[] = [];
  const banner = await mount(
    <AuditBanner
      audit={existence}
      governance={[]}
      reports={[".vortspec/ai/reports/adoption.md", ".vortspec/ai/reports/token-violations.md"]}
      onOpenReport={(path) => opened.push(path)}
    />,
  );
  await banner.getByRole("button", { name: /audit finding/ }).click();
  await expect(banner.getByTestId("audit-reports")).toContainText("adoption.md");
  await expect(banner.getByTestId("audit-reports")).toContainText("token-violations.md");
});

test("hides the filter when every finding is the same kind", async ({ mount }) => {
  const banner = await mount(<AuditBanner audit={existence} governance={[]} />);
  await banner.getByRole("button", { name: /audit finding/ }).click();
  await expect(banner.getByTestId("audit-kind-filter")).toHaveCount(0);
});
