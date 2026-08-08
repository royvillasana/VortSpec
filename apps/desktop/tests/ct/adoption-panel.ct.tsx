import { test, expect } from "@playwright/experimental-ct-react";
import { AdoptionPanel } from "@vortspec/ui/AdoptionPanel";
import type { AdoptionSummary } from "@vortspec/core/ipc";

const row = (name: string) => ({ name, path: `src/components/${name}.tsx`, tier: "atom", imports: 0, instances: 0 });

const SUMMARY: AdoptionSummary = {
  generatedAt: "2026-08-08T12:00:00.000Z",
  stale: false,
  total: 4,
  adopted: [row("Button"), row("Card")],
  importedNeverRendered: [{ ...row("Badge"), importedBy: ["src/views/Home.tsx"] }],
  unimported: [row("Drawer")],
  shadows: [
    { component: "Button", file: "src/views/Home.tsx", overlap: 0.8, sharedTokens: ["color-primary", "radius-md"] },
  ],
  truncated: false,
};

test("summarises adoption without expanding", async ({ mount }) => {
  const panel = await mount(<AdoptionPanel adoption={SUMMARY} />);
  await expect(panel).toContainText("2 of 4 components in use");
  await expect(panel).toContainText("1 imported, never rendered");
  await expect(panel).toContainText("1 unimported");
});

test("leads the details with the unambiguous waste", async ({ mount }) => {
  const panel = await mount(<AdoptionPanel adoption={SUMMARY} />);
  await panel.getByRole("button", { name: "Details" }).click();
  const text = (await panel.textContent()) ?? "";
  expect(text.indexOf("Imported but never rendered")).toBeLessThan(text.indexOf("Unimported"));
  await expect(panel).toContainText("imported by src/views/Home.tsx");
});

test("does NOT call unimported components dead", async ({ mount }) => {
  // The graph cannot tell a component nobody kept using from one built this morning. A panel that
  // labelled both "unused" would get the new one deleted.
  const panel = await mount(<AdoptionPanel adoption={SUMMARY} />);
  await panel.getByRole("button", { name: "Details" }).click();
  await expect(panel).toContainText("The graph cannot tell which");
});

test("shows shadow implementations with their evidence", async ({ mount }) => {
  const panel = await mount(<AdoptionPanel adoption={SUMMARY} />);
  await panel.getByRole("button", { name: "Details" }).click();
  await expect(panel).toContainText("Button → src/views/Home.tsx");
  await expect(panel).toContainText("80% overlap");
});

test("warns when the numbers describe an earlier state", async ({ mount }) => {
  const panel = await mount(<AdoptionPanel adoption={{ ...SUMMARY, stale: true }} />);
  await expect(panel.getByTestId("adoption-stale")).toContainText("describe an earlier state");
});

test("says so plainly when everything is adopted", async ({ mount }) => {
  const panel = await mount(
    <AdoptionPanel adoption={{ ...SUMMARY, importedNeverRendered: [], unimported: [], shadows: [] }} />,
  );
  await panel.getByRole("button", { name: "Details" }).click();
  await expect(panel.getByTestId("adoption-clean")).toBeVisible();
  await expect(panel.getByTestId("adoption-row")).toHaveCount(0);
});

test("renders NOTHING when no index has been built", async ({ mount }) => {
  // Not an empty panel of zeroes: "we have not looked" and "nothing is unused" are opposite claims.
  const panel = await mount(<AdoptionPanel adoption={null} />);
  await expect(panel).toBeEmpty();
});
