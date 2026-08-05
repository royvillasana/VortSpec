import { test, expect } from "@playwright/experimental-ct-react";
import { AuditBanner } from "@vortspec/ui/AuditBanner";
import type { DesignAudit } from "@vortspec/core/ipc";

const AUDIT: DesignAudit = {
  findings: [
    { component: "Button", file: "src/components/Button.tsx", severity: "error", kind: "hardcoded-color", message: "hardcodes #0055FF — use var(--color-primary)" },
    { component: "(tokens)", file: "tokens.css", severity: "warning", kind: "token-drift", message: "--color-primary drifted from Figma" },
  ],
  summary: { components: 12, findings: 2, drifted: 1 },
};

test("shows a summary and reveals findings on expand", async ({ mount }) => {
  const c = await mount(<AuditBanner audit={AUDIT} />);
  const banner = c.page().getByTestId("audit-banner");
  await expect(banner).toContainText("2 audit findings");
  await expect(banner).toContainText("1 to fix");
  await expect(banner).toContainText("1 drifted");
  // Collapsed by default — findings hidden until expanded.
  await expect(c.page().getByTestId("audit-finding")).toHaveCount(0);
  await c.page().getByRole("button").first().click();
  await expect(c.page().getByTestId("audit-finding")).toHaveCount(2);
  await expect(c.page().getByText(/use var\(--color-primary\)/)).toBeVisible();
});

test("renders nothing when the design system is clean", async ({ mount }) => {
  const c = await mount(<AuditBanner audit={{ findings: [], summary: { components: 5, findings: 0, drifted: 0 } }} />);
  await expect(c.page().getByTestId("audit-banner")).toHaveCount(0);
});

test("renders nothing while the audit is still loading (null)", async ({ mount }) => {
  const c = await mount(<AuditBanner audit={null} />);
  await expect(c.page().getByTestId("audit-banner")).toHaveCount(0);
});
