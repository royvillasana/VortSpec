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
};

test("lists components grouped by level with their status", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: RUNNING, previewInfo: HAS_SB } },
  });
  await expect(c.getByText("Atoms")).toBeVisible();
  await expect(c.getByText("Molecules")).toBeVisible();
  await expect(c.getByRole("button", { name: /^Button/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /^Card/ })).toBeVisible();
});

test("shows the selected component's identity, tokens, and spec/report links", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: RUNNING, previewInfo: HAS_SB } },
  });
  // Cockpit panel for the default-selected Button. Interactive controls now live
  // in the embedded Storybook, so the panel shows identity + provenance instead.
  await expect(c.getByText("Primary action")).toBeVisible();
  await expect(c.getByText("Tokens consumed")).toBeVisible();
  await expect(c.getByText("--color-primary")).toBeVisible();
  await expect(c.getByText("Source & spec")).toBeVisible();
  await expect(c.getByText("Component source")).toBeVisible();
  await expect(c.getByText("Visual-verify report")).toBeVisible();
});

test("dims spec/report links that don't exist yet", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: RUNNING, previewInfo: HAS_SB } },
  });
  await c.getByText("Card", { exact: true }).click();
  await expect(c.getByText("not created yet").first()).toBeVisible();
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
  // No interaction: the Playground detects no Storybook and stands one up.
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
  // No interaction: startDevServer returns a running Storybook and it embeds.
  const frame = c.locator("iframe");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", RUNNING.url);
});

test("deep-links the embedded Storybook to the selected component's autodocs", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: {
      mock: {
        components: COMPONENTS,
        devStatus: RUNNING,
        previewInfo: HAS_SB,
        storybookIndex: [
          { id: "button--docs", title: "Button", name: "Docs", type: "docs" },
          { id: "card--docs", title: "Card", name: "Docs", type: "docs" },
        ],
      },
    },
  });
  // Button is selected by default → its autodocs page is embedded.
  const frame = c.locator("iframe");
  await expect(frame).toHaveAttribute("src", `${RUNNING.url}/iframe.html?viewMode=docs&id=button--docs`);
  // Selecting Card re-points the embed.
  await c.getByRole("button", { name: /^Card/ }).click();
  await expect(frame).toHaveAttribute("src", `${RUNNING.url}/iframe.html?viewMode=docs&id=card--docs`);
});
