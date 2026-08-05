import { test, expect } from "@playwright/experimental-ct-react";
import { AppUpdateBanner } from "@vortspec/ui/AppUpdateBanner";
import type { UpdateInfo } from "@vortspec/core/update";

/**
 * The banner is presentational — it fetches nothing and persists nothing — so
 * every case here mounts it from a plain object with no IPC mock at all.
 *
 * One `mount()` per test: the CT harness keeps a single React root per page.
 * `/What.s new/` rather than an ASCII apostrophe: the label renders `&rsquo;`.
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

const noop = (): void => undefined;

test("names both versions", async ({ mount }) => {
  const c = await mount(
    <AppUpdateBanner info={AVAILABLE} onDownload={noop} onNotes={noop} onDismiss={noop} />,
  );
  const banner = c.page().getByTestId("app-update-banner");
  await expect(banner).toContainText("0.1.35");
  await expect(banner).toContainText("you have 0.1.34");
});

test("labels the download for Apple Silicon", async ({ mount }) => {
  const c = await mount(
    <AppUpdateBanner info={AVAILABLE} onDownload={noop} onNotes={noop} onDismiss={noop} />,
  );
  await expect(c.page().getByRole("button", { name: /Apple Silicon/ })).toBeVisible();
});

test("labels the download for Intel", async ({ mount }) => {
  const c = await mount(
    <AppUpdateBanner
      info={{ ...AVAILABLE, downloadArch: "x64", downloadUrl: "https://example/intel.dmg" }}
      onDownload={noop}
      onNotes={noop}
      onDismiss={noop}
    />,
  );
  await expect(c.page().getByRole("button", { name: /Intel/ })).toBeVisible();
});

test("does not claim an architecture when none was resolved", async ({ mount }) => {
  // No matching asset → the button goes to the release page, so promising
  // "Download for Apple Silicon" would misdescribe where the click leads.
  const c = await mount(
    <AppUpdateBanner
      info={{ ...AVAILABLE, downloadArch: null, downloadUrl: null }}
      onDownload={noop}
      onNotes={noop}
      onDismiss={noop}
    />,
  );
  await expect(c.page().getByRole("button", { name: "Get the update" })).toBeVisible();
  await expect(c.page().getByRole("button", { name: /Apple Silicon|Intel/ })).toHaveCount(0);
});

test("fires each of the three actions", async ({ mount }) => {
  const fired: string[] = [];
  const c = await mount(
    <AppUpdateBanner
      info={AVAILABLE}
      onDownload={() => fired.push("download")}
      onNotes={() => fired.push("notes")}
      onDismiss={() => fired.push("dismiss")}
    />,
  );
  await c.page().getByRole("button", { name: /Apple Silicon/ }).click();
  await c.page().getByRole("button", { name: /What.s new/ }).click();
  await c.page().getByRole("button", { name: "Dismiss update notice" }).click();

  expect(fired).toEqual(["download", "notes", "dismiss"]);
});

test("hides What's new when there is no release page", async ({ mount }) => {
  const c = await mount(
    <AppUpdateBanner
      info={{ ...AVAILABLE, releaseUrl: null }}
      onDownload={noop}
      onNotes={noop}
      onDismiss={noop}
    />,
  );
  await expect(c.page().getByRole("button", { name: /What.s new/ })).toHaveCount(0);
});

test("renders nothing when the app is up to date", async ({ mount }) => {
  const c = await mount(
    <AppUpdateBanner
      info={{ ...AVAILABLE, hasUpdate: false }}
      onDownload={noop}
      onNotes={noop}
      onDismiss={noop}
    />,
  );
  await expect(c.page().getByTestId("app-update-banner")).toHaveCount(0);
});

test("renders nothing when the check never reached GitHub", async ({ mount }) => {
  // hasUpdate false and latest null — a banner here would announce a version
  // we never learned.
  const c = await mount(
    <AppUpdateBanner
      info={{ ...AVAILABLE, hasUpdate: false, reachable: false, latest: null }}
      onDownload={noop}
      onNotes={noop}
      onDismiss={noop}
    />,
  );
  await expect(c.page().getByTestId("app-update-banner")).toHaveCount(0);
});
