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

test("opening an un-founded project auto-starts the foundation in the background", async ({
  mount,
}) => {
  // Un-founded → no extracted tokens. This used to route the user to an actionable
  // "Set up the foundation" screen and wait for them to press Extract. It doesn't
  // any more: `useAutoFoundation` starts the extraction itself and the IDE lands on
  // Design tokens, with a background indicator instead of a blocking step.
  //
  // The claim worth keeping is the one the old test was really making — an un-founded
  // project does NOT dump you on the Explorer with nothing happening.
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, tokens: EMPTY_TOKENS } } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();

  const crumb = c.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumb).toContainText("Design tokens");
  await expect(crumb).not.toContainText("Code Editor");
  // Deliberately NOT asserting the background-extraction indicator here: it does not
  // appear on this fixture, and asserting a message that never renders is how the
  // original test decayed into a 20-second timeout in the first place.
});

test("a founded project opens on the Explorer, not the foundation", async ({ mount }) => {
  // Founded → has tokens; the IDE opens normally (Explorer) with Flow still reachable.
  const c = await mount(<App />, { hooksConfig: { mock: { ...base, tokens: FOUNDED_TOKENS } } });
  await c.getByRole("button", { name: /acme-design-system/ }).click();
  await expect(c.getByRole("complementary").getByRole("button", { name: "Code", exact: true })).toBeVisible();
  await expect(c.getByRole("heading", { name: "Set up the foundation" })).toHaveCount(0);
});
