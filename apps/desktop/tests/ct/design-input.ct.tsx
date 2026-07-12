import { test, expect } from "@playwright/experimental-ct-react";
import { DesignInput } from "../../src/renderer/src/views/DesignInput";
import { PROJECT } from "./support/fixtures";
import type { SetupAnswers } from "@vortspec/core/ipc";

const noop = (): void => {};

test("offers a GitHub-repo source that continues with the repo url + branch (M3.1)", async ({ mount }) => {
  let source: Partial<SetupAnswers> | null = null;
  const c = await mount(
    <DesignInput project={PROJECT} onBack={noop} onContinue={(s) => (source = s)} />,
    { hooksConfig: { mock: {} } },
  );
  await c.getByRole("button", { name: "GitHub repo" }).click();
  await expect(c.getByText("Import a GitHub repository")).toBeVisible();

  // Continue is gated until a valid remote URL is entered.
  const cont = c.getByRole("button", { name: /Continue to setup/ });
  await expect(cont).toBeDisabled();
  await c.getByPlaceholder("https://github.com/owner/repo").fill("https://github.com/me/design-system");
  await c.getByPlaceholder(/branch \(optional/).fill("develop");
  await expect(cont).toBeEnabled();

  await cont.click();
  expect(source!.designSource).toBe("github");
  expect(source!.githubRepoUrl).toBe("https://github.com/me/design-system");
  expect(source!.githubBranch).toBe("develop");
});

test("picks a .zip via the native file dialog and continues with its path", async ({ mount }) => {
  let source: Partial<SetupAnswers> | null = null;
  const c = await mount(
    <DesignInput project={PROJECT} onBack={noop} onContinue={(s) => (source = s)} />,
    { hooksConfig: { mock: { pickFileResult: "/Users/dev/exports/design-system.zip" } } },
  );
  // The ZIP tab is the default; Continue is gated until a .zip is chosen.
  const cont = c.getByRole("button", { name: /Continue to setup/ });
  await expect(cont).toBeDisabled();

  await c.getByRole("button", { name: /Choose .zip/ }).click();
  await expect(c.getByText("design-system.zip")).toBeVisible();
  await expect(cont).toBeEnabled();

  await cont.click();
  expect(source!.designSource).toBe("zip");
  expect(source!.zipFilePath).toBe("/Users/dev/exports/design-system.zip");
});

test("offers a Claude Design source that continues with the project link", async ({ mount }) => {
  let source: Partial<SetupAnswers> | null = null;
  const c = await mount(
    <DesignInput project={PROJECT} onBack={noop} onContinue={(s) => (source = s)} />,
    { hooksConfig: { mock: {} } },
  );
  await c.getByRole("button", { name: "Claude Design" }).click();
  await expect(c.getByText("Paste a Claude Design link")).toBeVisible();
  const cont = c.getByRole("button", { name: /Continue to setup/ });
  await expect(cont).toBeDisabled();
  await c.getByPlaceholder("https://claude.ai/design/p/…").fill("https://claude.ai/design/p/abc123");
  await expect(cont).toBeEnabled();
  await cont.click();
  expect(source!.designSource).toBe("claude-design");
  expect(source!.claudeDesignUrl).toBe("https://claude.ai/design/p/abc123");
});
