import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataStatus } from "@vortspec/ui/MetadataStatus";
import type { MetadataPlan } from "@vortspec/core/ipc";

const PARTIAL: MetadataPlan = { total: 12, withMetadata: 8, missing: ["Card", "Modal", "Tabs", "Toast"], prompt: "generate…" };
const COMPLETE: MetadataPlan = { total: 5, withMetadata: 5, missing: [], prompt: "" };

test("shows coverage and offers a generate action for the gap", async ({ mount }) => {
  let gen = 0;
  const c = await mount(<MetadataStatus plan={PARTIAL} running={false} onGenerate={() => (gen += 1)} />);
  await expect(c.page().getByTestId("metadata-status")).toContainText("8/12");
  const btn = c.page().getByTestId("generate-metadata");
  await expect(btn).toContainText("Generate for 4");
  await btn.click();
  await expect.poll(() => gen).toBe(1);
});

test("shows a running state and disables the button", async ({ mount }) => {
  const c = await mount(<MetadataStatus plan={PARTIAL} running onGenerate={() => {}} />);
  await expect(c.page().getByTestId("generate-metadata")).toBeDisabled();
  await expect(c.page().getByTestId("metadata-status")).toContainText("Generating");
});

test("shows a complete state with no button when every component is covered", async ({ mount }) => {
  const c = await mount(<MetadataStatus plan={COMPLETE} running={false} onGenerate={() => {}} />);
  await expect(c.page().getByTestId("metadata-status")).toContainText("complete");
  await expect(c.page().getByTestId("generate-metadata")).toHaveCount(0);
});

test("renders nothing when there is no roster", async ({ mount }) => {
  const c = await mount(<MetadataStatus plan={{ total: 0, withMetadata: 0, missing: [], prompt: "" }} running={false} onGenerate={() => {}} />);
  await expect(c.page().getByTestId("metadata-status")).toHaveCount(0);
});
