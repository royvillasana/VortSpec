import { test, expect } from "@playwright/experimental-ct-react";
import { Profile } from "../../src/renderer/src/views/Profile";
import type { UsageResult, Profile as ProfileT } from "../../src/shared/ipc";

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
  await expect(c.getByText(/Mirrors Claude Code's/)).toBeVisible();
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
