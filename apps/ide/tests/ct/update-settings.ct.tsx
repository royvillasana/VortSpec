import { test, expect } from "@playwright/experimental-ct-react";
import { Profile } from "@vortspec/ui/Profile";
import type { UpdateInfo } from "@vortspec/core/ipc";

/**
 * The Settings software-update section. The load-bearing assertion is that
 * "couldn't reach GitHub" is never rendered as "you're up to date" — both carry
 * `hasUpdate: false`, and only one of them was actually verified.
 */

const AVAILABLE: UpdateInfo = {
  current: "0.1.34",
  latest: "0.1.35",
  hasUpdate: true,
  reachable: true,
  releaseUrl: "https://github.com/royvillasana/VortSpec/releases/tag/v0.1.35",
  downloadUrl: "https://example/VortSpec-IDE-mac-arm64.dmg",
  downloadArch: "arm64",
  checkedAt: 1_700_000_000_000,
};

const UP_TO_DATE: UpdateInfo = { ...AVAILABLE, current: "0.1.35", hasUpdate: false };

const UNREACHABLE: UpdateInfo = {
  current: "0.1.34",
  latest: null,
  hasUpdate: false,
  reachable: false,
  releaseUrl: null,
  downloadUrl: null,
  downloadArch: null,
  checkedAt: null,
};

const base = { profile: { name: "Dev", avatarDataUrl: null, preferences: {} } };
const noop = (): void => undefined;

test("shows the running version before any check", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, { hooksConfig: { mock: base } });

  await expect(c.page().getByText("Software update")).toBeVisible();
  await expect(c.page().getByRole("button", { name: "Check for updates" })).toBeEnabled();
  // Idle: no verdict claimed until the user asks.
  await expect(c.page().getByText(/latest version/)).toHaveCount(0);
  await expect(c.page().getByText(/Couldn.t reach GitHub/)).toHaveCount(0);
});

test("reports up to date, naming the version checked against", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: { mock: { ...base, update: UP_TO_DATE } },
  });
  await c.page().getByRole("button", { name: "Check for updates" }).click();

  await expect(c.page().getByText(/latest version \(0\.1\.35\)/)).toBeVisible();
});

test("reports an available update with a download", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: { mock: { ...base, update: AVAILABLE } },
  });
  await c.page().getByRole("button", { name: "Check for updates" }).click();

  const banner = c.page().getByTestId("app-update-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("0.1.35");
  await expect(c.page().getByRole("button", { name: /Apple Silicon/ })).toBeVisible();
});

test("says it could not reach GitHub — never that the app is up to date", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: { mock: { ...base, update: UNREACHABLE } },
  });
  await c.page().getByRole("button", { name: "Check for updates" }).click();

  await expect(c.page().getByText(/Couldn.t reach GitHub/)).toBeVisible();
  // The distinction this whole `reachable` field exists for.
  await expect(c.page().getByText(/latest version/)).toHaveCount(0);
});

test("disables the control while checking, and re-enables it after a failure", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: { mock: { ...base, update: UNREACHABLE, updateDelayMs: 1200 } },
  });
  const button = c.page().getByRole("button", { name: /Check for updates|Checking/ });
  await button.click();

  await expect(c.page().getByRole("button", { name: "Checking…" })).toBeDisabled();
  // A failed check must leave the user able to retry.
  await expect(c.page().getByRole("button", { name: "Check for updates" })).toBeEnabled({
    timeout: 10_000,
  });
});

test("discloses that checking contacts GitHub and installs nothing", async ({ mount }) => {
  // The launch check cannot be turned off, so this disclosure is the only
  // account the user gets of the outbound request.
  const c = await mount(<Profile onBack={noop} />, { hooksConfig: { mock: base } });
  await expect(c.page().getByText(/checks GitHub for new releases on launch/)).toBeVisible();
  await expect(c.page().getByText(/installs nothing on its own/)).toBeVisible();
});
