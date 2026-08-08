import { test, expect } from "@playwright/experimental-ct-react";
import { DesignSystem } from "@vortspec/ui/DesignSystem";

const PROJECT = { path: "/tmp/p", name: "p" } as never;

/**
 * The silent-success gap: a foundation run that extracts tokens and finds NO components previously
 * reported success and said nothing, because the terminal test was `tokens > 0 || components > 0`.
 */

test("says so when tokens were extracted but no components found", async ({ mount }) => {
  const view = await mount(
    <DesignSystem project={PROJECT} hideRail onBack={() => {}} foundationOutcome="tokens-only" />,
  );
  const notice = view.getByTestId("foundation-tokens-only");
  await expect(notice).toContainText("no components were found");
  // The run did NOT fail — saying so avoids sending someone to debug a working extraction.
  await expect(notice).toContainText("finished successfully");
  // And it names the consequence, which is the part that was invisible.
  await expect(notice).toContainText("Nothing downstream can proceed");
});

test("stays silent when the foundation produced both", async ({ mount }) => {
  const view = await mount(
    <DesignSystem project={PROJECT} hideRail onBack={() => {}} foundationOutcome="ready" />,
  );
  await expect(view.getByTestId("foundation-tokens-only")).toHaveCount(0);
});

test("stays silent while a run is still in flight", async ({ mount }) => {
  // Mid-run there is nothing to conclude yet; a warning here would be wrong, not early.
  const view = await mount(
    <DesignSystem project={PROJECT} hideRail onBack={() => {}} foundationOutcome="running" />,
  );
  await expect(view.getByTestId("foundation-tokens-only")).toHaveCount(0);
});

test("stays silent by default, so an unconfigured project is not warned at", async ({ mount }) => {
  const view = await mount(<DesignSystem project={PROJECT} hideRail onBack={() => {}} />);
  await expect(view.getByTestId("foundation-tokens-only")).toHaveCount(0);
});
