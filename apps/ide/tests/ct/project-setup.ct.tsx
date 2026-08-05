import { test, expect } from "@playwright/experimental-ct-react";
import { ProjectSetup } from "@vortspec/ui/ProjectSetup";
import { PROJECT } from "./support/fixtures";

const noop = (): void => {};
const props = { project: PROJECT, onCreated: noop, onCancel: noop };

test("the ZIP source shows a real upload component, not a path field", async ({ mount }) => {
  const c = await mount(<ProjectSetup {...props} />, { hooksConfig: { mock: {} } });
  await expect(c.getByRole("heading", { name: "Set up your stack" })).toBeVisible();
  // Pick the ZIP source (it advertises the multi-tool export subtitle).
  await c.getByRole("button", { name: /ZIP File/ }).click();
  await expect(c.getByText(/Exported from Stitch, Claude Design, or any other design tool/)).toBeVisible();
  // A drop target + a native picker — no "Path to the ZIP file" text input.
  await expect(c.getByRole("button", { name: /Choose .zip/ })).toBeVisible();
  await expect(c.getByText("Path to the ZIP file")).toHaveCount(0);
});

test("the ZIP picker fills the upload and enables Create", async ({ mount }) => {
  const c = await mount(<ProjectSetup {...props} />, {
    hooksConfig: { mock: { pickFileResult: "/Users/dev/exports/system.zip" } },
  });
  await c.getByRole("button", { name: /ZIP File/ }).click();
  await c.getByRole("button", { name: /Choose .zip/ }).click();
  await expect(c.getByText("system.zip")).toBeVisible();
  // Setup is valid → Next is enabled (the create gate opens on a valid source).
  await expect(c.getByRole("button", { name: "Next →" })).toBeEnabled();
});

test("offers Claude Design as its own live-link source", async ({ mount }) => {
  const c = await mount(<ProjectSetup {...props} />, { hooksConfig: { mock: {} } });
  // The source card (name = label + hint); anchor to the start to skip the ZIP card,
  // whose subtitle also mentions Claude Design.
  await c.getByRole("button", { name: /^Claude Design/ }).click();
  await expect(c.getByText("Claude Design project link")).toBeVisible();
  await expect(c.getByPlaceholder("https://claude.ai/design/p/…")).toBeVisible();
  await expect(c.getByText(/Claude Code reads the project through the design MCP/)).toBeVisible();
});
