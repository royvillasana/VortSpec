import { test, expect } from "@playwright/experimental-ct-react";
import { DevPreview } from "../../src/renderer/src/views/DevPreview";
import { PROJECT, COMPONENTS, HARNESS_TRANSCRIPT } from "./support/fixtures";

const STOPPED = { state: "stopped", url: null, script: null, message: null };
const RUNNING = { state: "running", url: "http://localhost:6006", script: "storybook", message: null };
const HAS_SB = { hasStorybook: true, script: "storybook" };
const NO_SB = { hasStorybook: false, script: null };

const noop = (): void => {};
const props = {
  project: PROJECT,
  onBack: noop,
  onOpenRun: noop,
  onOpenInspector: noop,
  onOpenHistory: noop,
  onOpenManifest: noop,
};

test("rail includes the Manifest destination", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: RUNNING, previewInfo: HAS_SB } },
  });
  // The canonical rail: Flow · Run · Playground · Tokens · Manifest · History.
  for (const label of ["Flow", "Run", "Playground", "Tokens", "Manifest", "History"]) {
    await expect(c.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});

test("embeds Storybook at its root with no VortSpec component sidebar", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: RUNNING, previewInfo: HAS_SB } },
  });
  // No VortSpec component sidebar anymore — Storybook's own sidebar navigates.
  await expect(c.getByText("Browse components in the Storybook sidebar →")).toBeVisible();
  // The embedded Storybook loads at its root URL.
  const frame = c.locator("iframe");
  await expect(frame).toHaveAttribute("src", `${RUNNING.url}/`);
  // No embedded chat panel in the view — the assistant is the global top-bar dock.
  await expect(c.getByText("Modify with Claude")).toHaveCount(0);
});

test("auto-generates Storybook (no clicks) when the project has none", async ({ mount }) => {
  // Drop the terminal `result` so the run stays in-flight and the overlay
  // (with the streamed prose) remains mounted for a deterministic assertion.
  const streaming = HARNESS_TRANSCRIPT.slice(0, -1);
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: {
      mock: { components: COMPONENTS, devStatus: STOPPED, previewInfo: NO_SB, runScript: streaming },
    },
  });
  await expect(
    c.getByText("Created a preview harness that renders every component."),
  ).toBeVisible();
});

test("auto-embeds Storybook when it is already set up (no clicks)", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: {
      mock: {
        components: COMPONENTS,
        devStatus: STOPPED,
        devStartStatus: RUNNING,
        previewInfo: HAS_SB,
      },
    },
  });
  const frame = c.locator("iframe");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", `${RUNNING.url}/`);
});

test("offers Sync stories from the header", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: RUNNING, previewInfo: HAS_SB } },
  });
  await expect(c.getByRole("button", { name: "Sync stories" })).toBeVisible();
  // The dev-server control shows the running port.
  await expect(c.getByText(":6006")).toBeVisible();
});
