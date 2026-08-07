import { test, expect } from "@playwright/experimental-ct-react";
import { ReadinessLadder } from "@vortspec/ui/ReadinessLadder";
import type { ReadinessAssessmentPayload } from "@vortspec/core/ipc";

/** The AI-readiness ladder — OpenSpec change: agentic-design-system, task 5.3. */

const AT_3: ReadinessAssessmentPayload = {
  level: 3,
  levelName: "Governed",
  blocking: ["metadata-completeness"],
  nextAction: "Complete 6 records — a migrated record reads as documentation and answers nothing.",
  signals: [
    {
      id: "graph-connectedness",
      label: "Relationship graph",
      value: 0.8,
      threshold: 0.5,
      met: true,
      gates: 2,
      detail: "16 of 20 components are wired in (34 edges).",
      action: "",
    },
    {
      id: "metadata-completeness",
      label: "Docs machine-readable",
      value: 0.7,
      threshold: 0.9,
      met: false,
      gates: 4,
      detail: "14 of 20 records are complete.",
      action: "Complete 6 records — a migrated record reads as documentation and answers nothing.",
    },
  ],
};

test("shows the level and fills one rung per level reached", async ({ mount }) => {
  const ladder = await mount(<ReadinessLadder readiness={AT_3} />);
  await expect(ladder).toContainText("3/5 · Governed");
  await expect(ladder.getByTestId("readiness-rungs").locator("span")).toHaveCount(5);
  await expect(ladder.getByLabel("Governed (reached)")).toBeVisible();
  await expect(ladder.getByLabel("Operational")).toBeVisible();
});

test("shows the next action WITHOUT expanding — it is the part most people need", async ({ mount }) => {
  const ladder = await mount(<ReadinessLadder readiness={AT_3} />);
  await expect(ladder.getByTestId("readiness-next")).toContainText("Complete 6 records");
});

test("names the level a signal gates, met or not", async ({ mount }) => {
  // The reader needs to see what is holding the level UP as much as what is holding it back.
  const ladder = await mount(<ReadinessLadder readiness={AT_3} />);
  await ladder.getByRole("button", { name: "Signals" }).click();
  const signals = ladder.getByTestId("readiness-signals");
  await expect(signals).toContainText("Relationship graph");
  await expect(signals).toContainText("(L2)");
  await expect(signals).toContainText("(L4) · blocking");
});

test("shows no next action at the top of the ladder", async ({ mount }) => {
  const ladder = await mount(
    <ReadinessLadder readiness={{ ...AT_3, level: 5, levelName: "Agentic", blocking: [], nextAction: null }} />,
  );
  await expect(ladder).toContainText("5/5 · Agentic");
  await expect(ladder.getByTestId("readiness-next")).toHaveCount(0);
});

test("renders nothing before the level has been read", async ({ mount }) => {
  const ladder = await mount(<ReadinessLadder readiness={null} />);
  await expect(ladder).toBeEmpty();
});
