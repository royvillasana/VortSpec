import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataStatus } from "@vortspec/ui/MetadataStatus";
import type { MetadataPlan } from "@vortspec/core/ipc";

const PARTIAL: MetadataPlan = {
  total: 12,
  complete: 8,
  incomplete: [],
  missing: ["Card", "Modal", "Tabs", "Toast"],
  withMetadata: 8,
  prompt: "generate…",
};
const COMPLETE: MetadataPlan = { total: 5, complete: 5, incomplete: [], missing: [], withMetadata: 5, prompt: "" };
/** Every component has a file, but half of them are migrated legacy records (task 1.5). */
const HOLLOW: MetadataPlan = {
  total: 4,
  complete: 2,
  incomplete: [
    { name: "Card", gaps: ["migrated"] },
    { name: "Modal", gaps: ["no-selection-criteria"] },
  ],
  missing: [],
  withMetadata: 4,
  prompt: "generate…",
};

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
  const c = await mount(
    <MetadataStatus
      plan={{ total: 0, complete: 0, incomplete: [], missing: [], withMetadata: 0, prompt: "" }}
      running={false}
      onGenerate={() => {}}
    />,
  );
  await expect(c.page().getByTestId("metadata-status")).toHaveCount(0);
});

test("a roster of hollow records reads as incomplete, not as covered (task 1.5)", async ({ mount }) => {
  // Every component HAS a file here. Counting files would show 4/4 complete and hide the real gap.
  const c = await mount(<MetadataStatus plan={HOLLOW} running={false} onGenerate={() => {}} />);
  await expect(c.page().getByTestId("metadata-status")).toContainText("2/4");
  await expect(c.page().getByTestId("metadata-incomplete")).toContainText("2 incomplete");
  await expect(c.page().getByTestId("generate-metadata")).toContainText("Generate for 2");
});
