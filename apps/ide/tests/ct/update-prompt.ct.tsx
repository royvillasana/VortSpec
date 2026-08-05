import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { UpdateInfo } from "@vortspec/core/ipc";

/**
 * The update prompt on the IDE's INITIAL screen — the surface every user passes
 * through before opening a workspace, which is why the notice lives there.
 *
 * These mount the whole `App` (not the banner in isolation) because what is
 * under test is the wiring: the launch check firing, the dismissal rule, and
 * the promise that a slow or failed check never degrades the screen.
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

const UP_TO_DATE: UpdateInfo = {
  ...AVAILABLE,
  current: "0.1.35",
  hasUpdate: false,
};

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

const base = { profile: { name: "Dev", avatarDataUrl: null, preferences: {} }, projects: [] };

test("announces an available update on the initial screen", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, update: AVAILABLE } } });
  const banner = c.page().getByTestId("app-update-banner");

  await expect(banner).toBeVisible();
  await expect(banner).toContainText("0.1.35");
  await expect(banner).toContainText("you have 0.1.34");
});

test("says nothing when the app is up to date", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, update: UP_TO_DATE } } });
  await expect(c.page().getByTestId("app-update-banner")).toHaveCount(0);
});

test("says nothing, and shows no error, when the check could not reach GitHub", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, update: UNREACHABLE } } });

  await expect(c.page().getByTestId("app-update-banner")).toHaveCount(0);
  // The initial screen is intact — an update check failing is not the user's problem.
  await expect(c.page().getByText(/VortSpec/).first()).toBeVisible();
});

test("the initial screen is usable while the check is still in flight", async ({ mount }) => {
  // The check must never gate first paint: the screen is interactive
  // immediately, and the banner arrives late if at all.
  const c = await mount(<App />, {
    hooksConfig: { mock: { ...base, update: AVAILABLE, updateDelayMs: 1500 } },
  });

  await expect(c.page().getByTestId("app-update-banner")).toHaveCount(0);
  await expect(c.page().getByText(/VortSpec/).first()).toBeVisible();
  // ...and once it settles, the prompt appears without a reload.
  await expect(c.page().getByTestId("app-update-banner")).toBeVisible({ timeout: 10_000 });
});

test("a version dismissed on a previous launch stays quiet", async ({ mount }) => {
  const c = await mount(<App />, {
    hooksConfig: { mock: { ...base, update: AVAILABLE, dismissedUpdate: "0.1.35" } },
  });
  await expect(c.page().getByTestId("app-update-banner")).toHaveCount(0);
});

test("a release newer than the dismissed one speaks up again", async ({ mount }) => {
  // Dismissal is keyed by version precisely so it expires by itself.
  const c = await mount(<App />, {
    hooksConfig: {
      mock: {
        ...base,
        update: { ...AVAILABLE, latest: "0.1.36" },
        dismissedUpdate: "0.1.35",
      },
    },
  });
  await expect(c.page().getByTestId("app-update-banner")).toContainText("0.1.36");
});

test("Later hides the prompt", async ({ mount }) => {
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, update: AVAILABLE } } });
  const banner = c.page().getByTestId("app-update-banner");
  await expect(banner).toBeVisible();

  await c.page().getByRole("button", { name: "Dismiss update notice" }).click();
  await expect(banner).toHaveCount(0);
});
