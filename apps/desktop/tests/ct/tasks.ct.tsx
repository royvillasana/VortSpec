import { test, expect } from "@playwright/experimental-ct-react";
import { Tasks } from "@vortspec/ui/Tasks";
import { PROJECT } from "./support/fixtures";
import type { TaskAuth } from "@vortspec/core/ipc";

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

const NOT_INSTALLED: TaskAuth = {
  provider: "jira",
  cliInstalled: false,
  configured: false,
  account: null,
  sites: [],
  installCommand: "brew install ankitpokhrel/jira-cli/jira-cli",
  hint: "The Jira CLI isn't installed. VortSpec can install it for you (with your permission).",
};
const CONNECTED: TaskAuth = {
  provider: "jira",
  cliInstalled: true,
  configured: true,
  account: "dev@acme.com",
  sites: ["dev@acme.com"],
  installCommand: null,
  hint: null,
};

test("offers to install the Jira CLI with explicit permission (M7)", async ({ mount }) => {
  const c = await mount(<Tasks {...props} />, { hooksConfig: { mock: { taskAuth: NOT_INSTALLED } } });
  await c.getByRole("button", { name: /Install the Jira CLI \(with permission\)/ }).click();
  // Shows exactly what will run before installing.
  await expect(c.getByText("brew install ankitpokhrel/jira-cli/jira-cli")).toBeVisible();
  await expect(c.getByRole("button", { name: "Install the Jira CLI" })).toBeVisible();
});

test("connects and offers to create a story (M7)", async ({ mount }) => {
  const c = await mount(<Tasks {...props} />, {
    hooksConfig: { mock: { taskAuth: CONNECTED, taskProjects: [{ key: "DES", name: "Design System" }] } },
  });
  await expect(c.getByText("Connected as dev@acme.com")).toBeVisible();
  await expect(c.getByText("Create a story")).toBeVisible();
  const create = c.getByRole("button", { name: /Create Story/ });
  await expect(create).toBeVisible();
  await expect(create).toBeDisabled(); // needs a summary
  await c.getByPlaceholder("Summary").fill("Build the Button");
  await expect(create).toBeEnabled();
});
