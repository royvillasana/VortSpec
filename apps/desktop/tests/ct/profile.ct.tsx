import { test, expect } from "@playwright/experimental-ct-react";
import { Profile } from "@vortspec/ui/Profile";
import type { UsageResult, Profile as ProfileT } from "@vortspec/core/ipc";

const noop = (): void => {};

const USAGE: UsageResult = {
  available: true,
  headline: "You are currently using your subscription to power your Claude Code usage",
  limits: [
    { label: "Current session", percent: 7, resetsAt: "Jul 7 at 6:30pm" },
    { label: "Current week (all models)", percent: 46, resetsAt: "Jul 8 at 2am" },
  ],
  note: "Approximate, based on local sessions on this machine.",
  raw: "Current session: 7% used …",
  capturedAt: "2026-07-07T00:00:00.000Z",
  error: null,
};

const PROFILE: ProfileT = { name: "Roy", avatarDataUrl: null, preferences: { framework: "react" } };

test("mirrors Claude's usage percentage bars", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: { mock: { usage: USAGE, profile: PROFILE } },
  });
  await expect(c.getByText("Current session")).toBeVisible();
  await expect(c.getByText("7%", { exact: true })).toBeVisible();
  await expect(c.getByText("Current week (all models)")).toBeVisible();
  await expect(c.getByText("46%", { exact: true })).toBeVisible();
  await expect(c.getByText(/resets Jul 7 at 6:30pm/)).toBeVisible();
  await expect(c.getByText(/Your account's plan limits/)).toBeVisible();
});

test("shows a fix-it message when usage is unavailable", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: {
      mock: {
        usage: { available: false, headline: null, limits: [], note: null, raw: "", capturedAt: "", error: "Make sure you're logged in." },
        profile: PROFILE,
      },
    },
  });
  await expect(c.getByText(/Make sure you're logged in/)).toBeVisible();
});

test("edits the profile name and saves", async ({ mount }) => {
  let saved: ProfileT | null = null;
  const c = await mount(<Profile onBack={noop} onSaved={(p) => (saved = p)} />, {
    hooksConfig: { mock: { usage: USAGE, profile: { name: "", avatarDataUrl: null, preferences: {} } } },
  });
  await c.getByPlaceholder(/How should we call you/).fill("Roy");
  await c.getByRole("button", { name: "Save profile" }).click();
  await expect(c.getByText("✓ Saved")).toBeVisible();
  expect(saved!.name).toBe("Roy");
});

test("updates the Figma API token (write-through, stores no value)", async ({ mount }) => {
  const c = await mount(<Profile onBack={noop} />, {
    hooksConfig: {
      mock: {
        usage: USAGE,
        profile: PROFILE,
        figmaTokenStatus: {
          configured: true,
          serverName: "figma-console",
          envVar: "FIGMA_ACCESS_TOKEN",
          message: "A Figma token is set on “figma-console” (FIGMA_ACCESS_TOKEN). Paste a new one to replace it.",
        },
        setFigmaTokenResult: { ok: true, message: "Figma token updated on “figma-console”. Re-run the scan to pick it up." },
      },
    },
  });
  await expect(c.getByRole("heading", { name: "Figma API token" })).toBeVisible();
  await expect(c.getByText(/A Figma token is set on/)).toBeVisible();
  // Never stored in VortSpec — the field is empty and the copy says so.
  await expect(c.getByText(/VortSpec never stores this token/)).toBeVisible();
  const save = c.getByRole("button", { name: "Save token" });
  await expect(save).toBeDisabled(); // gated until a token is entered
  await c.getByPlaceholder("figd_…").fill("figd_newtoken12345");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(c.getByText(/Figma token updated/)).toBeVisible();
});
