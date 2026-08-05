import { test, expect } from "@playwright/experimental-ct-react";
import { ConversationTabs } from "@vortspec/ui/ConversationTabs";
import type { Project } from "@vortspec/core/ipc";

const PROJECT = {
  id: "p1",
  name: "acme-design-system",
  path: "/Users/dev/acme-design-system",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const active = (c: import("@playwright/test").Locator) => c.getByTestId("active-conversation");

test("a handed-off task opens a dedicated tab that auto-runs its prompt", async ({ mount }) => {
  const c = await mount(
    <ConversationTabs
      project={PROJECT}
      incomingTask={{
        title: "Fix: Figma connection",
        prompt: "please reconnect figma",
        allowModify: true,
        origin: "the Foundation",
        returnTo: "flow",
        nonce: 1,
      }}
      onReturnToOrigin={() => {}}
    />,
    { hooksConfig: { mock: {} } },
  );
  // The task got its own tab, selected and active…
  await expect(c.getByRole("tab", { name: /Fix: Figma connection/ })).toBeVisible();
  // …and auto-started: the prompt is the opening bubble and was sent to Claude
  // with no typing or Send click.
  await expect(active(c).getByText("please reconnect figma")).toBeVisible();
  const prompts = await c.page().evaluate(
    () => (window as unknown as { __runPrompts: string[] }).__runPrompts,
  );
  expect(prompts.some((p) => p.includes("please reconnect figma"))).toBe(true);
});
