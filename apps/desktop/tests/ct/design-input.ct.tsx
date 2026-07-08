import { test, expect } from "@playwright/experimental-ct-react";
import { DesignInput } from "../../src/renderer/src/views/DesignInput";
import { PROJECT } from "./support/fixtures";
import type { SetupAnswers } from "../../src/shared/ipc";

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
