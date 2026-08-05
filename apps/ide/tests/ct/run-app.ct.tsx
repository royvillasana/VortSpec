import { test, expect } from "@playwright/experimental-ct-react";
import { RunApp } from "@vortspec/ui/RunApp";
import { AssistantTaskProvider, type AssistantTask } from "@vortspec/ui/assistant-task";
import { PROJECT } from "./support/fixtures";
import type { DevServerStatus } from "@vortspec/core/ipc";

const noop = (): void => {};
const props = {
  project: PROJECT,
  onBack: noop,
  onFlow: noop,
  onRun: noop,
  onPlayground: noop,
  onTokens: noop,
  onManifest: noop,
  onHistory: noop,
  onSource: noop,
};

const RUNNING: DevServerStatus = { state: "running", url: "http://localhost:5173", script: "dev", message: null };
const NO_SCRIPT: DevServerStatus = { state: "no-script", url: null, script: null, message: "No app dev script found." };

test("runs the app and embeds its localhost URL", async ({ mount }) => {
  const c = await mount(<RunApp {...props} />, {
    hooksConfig: { mock: { appStatus: RUNNING, appStartStatus: RUNNING } },
  });
  await expect(c.getByText("localhost:5173")).toBeVisible();
  await expect(c.getByRole("button", { name: "Open in browser" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(c.locator('iframe[title="app"]')).toHaveCount(1);
});

test("explains when there's no app dev script", async ({ mount }) => {
  const c = await mount(<RunApp {...props} />, {
    hooksConfig: { mock: { appStatus: NO_SCRIPT, appStartStatus: NO_SCRIPT } },
  });
  await expect(c.getByText("No app dev script found", { exact: true })).toBeVisible();
});

test("Playground: on a broken Storybook install, offers to fix it in the assistant", async ({ mount }) => {
  let task: AssistantTask | null = null;
  const c = await mount(
    <AssistantTaskProvider value={(t) => { task = t; }}>
      <RunApp {...props} kind="storybook" />
    </AssistantTaskProvider>,
    {
      hooksConfig: {
        mock: {
          storybookStatus: { installed: false, hasConfig: false, hasScript: false, storyCount: 0, components: 20, missingStories: 20 },
          ensureStorybook: { state: "failed", installed: false, storyCount: 0, error: "storybook init exited 1" },
        },
      },
    },
  );
  // Auto-provision runs, fails, and surfaces an actionable card (not the gallery).
  await expect(c.getByText(/Couldn’t set up Storybook automatically/)).toBeVisible();
  await c.getByRole("button", { name: /Fix in the assistant/ }).click();
  await expect.poll(() => task?.title ?? "").toContain("Storybook");
  expect((task as AssistantTask | null)?.prompt).toMatch(/never (create|start)|storybook@latest init/i);
});

test("Playground: when stories are missing, offers to generate them", async ({ mount }) => {
  let task: AssistantTask | null = null;
  const c = await mount(
    <AssistantTaskProvider value={(t) => { task = t; }}>
      <RunApp {...props} kind="storybook" />
    </AssistantTaskProvider>,
    {
      hooksConfig: {
        mock: {
          storybookStatus: { installed: true, hasConfig: true, hasScript: true, storyCount: 20, components: 50, missingStories: 30 },
        },
      },
    },
  );
  await expect(c.getByText(/30 components don’t have a story yet/)).toBeVisible();
  await c.getByRole("button", { name: /Generate missing stories/ }).click();
  await expect.poll(() => task?.title ?? "").toContain("Storybook");
});
