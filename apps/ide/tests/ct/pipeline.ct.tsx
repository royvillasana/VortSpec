import { test, expect } from "@playwright/experimental-ct-react";
import App from "../../src/renderer/src/App";
import type { Project } from "@vortspec/core/ipc";
import { EMPTY_TOKENS, FOUNDED_TOKENS } from "../../../desktop/tests/ct/support/mock-api";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const base = {
  profile: { name: "Dev", avatarDataUrl: null, preferences: {} },
  projects: [PROJECT],
  pickFolderResult: PROJECT,
};

test("opening an un-founded project auto-starts the Flow foundation (parity with cockpit)", async ({
  mount,
}) => {
  // Un-founded → no extracted tokens; the IDE should land on the actionable
  // foundation, not the Explorer and not a read-only stage list.
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, tokens: EMPTY_TOKENS } } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await expect(c.getByRole("heading", { name: "Set up the foundation" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Extract tokens & detect components/ })).toBeVisible();
});

test("a founded project opens on the Explorer, not the foundation", async ({ mount }) => {
  // Founded → has tokens; the IDE opens normally (Explorer) with Flow still reachable.
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, tokens: FOUNDED_TOKENS } } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await expect(c.getByRole("complementary").getByRole("button", { name: "Explorer", exact: true })).toBeVisible();
  await expect(c.getByRole("heading", { name: "Set up the foundation" })).toHaveCount(0);
});
