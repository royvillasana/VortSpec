import { test, expect } from "@playwright/experimental-ct-react";
import { DevPreview } from "../../src/renderer/src/views/DevPreview";
import { PROJECT, COMPONENTS, HARNESS_TRANSCRIPT } from "./support/fixtures";

const STOPPED = { state: "stopped", url: null, script: null, message: null };
const RUNNING = { state: "running", url: "http://localhost:5199", script: "dev", message: null };
const NO_SCRIPT = { state: "no-script", url: null, script: null, message: "No dev script found." };

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
    hooksConfig: { mock: { components: COMPONENTS, devStatus: STOPPED } },
  });
  await expect(c.getByText("Atoms")).toBeVisible();
  await expect(c.getByText("Molecules")).toBeVisible();
  // Component names appear in the picker (a button) and the canvas header; the
  // picker item's accessible name starts with the component name.
  await expect(c.getByRole("button", { name: /^Button/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /^Card/ })).toBeVisible();
});

test("shows the selected component's props, tokens, and spec/report links", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: STOPPED } },
  });
  // Button is selected by default (first component). Controls panel shows props + tokens.
  await expect(c.getByText("variant", { exact: true })).toBeVisible();
  await expect(c.getByText("Tokens consumed")).toBeVisible();
  await expect(c.getByText("--color-primary")).toBeVisible();
  // Source & spec links resolved from the fixture.
  await expect(c.getByText("Source & spec")).toBeVisible();
  await expect(c.getByText("Component source")).toBeVisible();
  await expect(c.getByText("Visual-verify report")).toBeVisible();
});

test("dims spec/report links that don't exist yet", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: STOPPED } },
  });
  // Select Card, which has no spec/report in the fixture.
  await c.getByText("Card", { exact: true }).click();
  await expect(c.getByText("not created yet").first()).toBeVisible();
});

test("auto-generates a harness (no clicks) when there is no preview surface", async ({ mount }) => {
  // Drop the terminal `result` so the run stays in-flight and the overlay
  // (with the streamed prose) remains mounted for a deterministic assertion.
  const streaming = HARNESS_TRANSCRIPT.slice(0, -1);
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: NO_SCRIPT, runScript: streaming } },
  });
  // No interaction: the Playground detects there's no dev script and generates
  // the harness itself, streaming progress.
  await expect(
    c.getByText("Created a preview harness that renders every component."),
  ).toBeVisible();
});

test("auto-embeds the live preview when a dev server is available (no clicks)", async ({ mount }) => {
  const c = await mount(<DevPreview {...props} />, {
    hooksConfig: { mock: { components: COMPONENTS, devStatus: STOPPED } },
  });
  // No interaction: the Playground auto-starts the dev server and embeds it.
  const frame = c.locator("iframe");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", RUNNING.url);
});
