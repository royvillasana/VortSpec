import { test, expect } from "@playwright/experimental-ct-react";
import { LibraryPanel } from "@vortspec/ui/LibraryPanel";
import type { Project } from "@vortspec/core/ipc";

/**
 * The Library panel (change: design-system-style-panel).
 *
 * The test that matters most here is the LAST one. The panel is mounted on two surfaces at once — the
 * Playground's Library tab and the Design-tokens sidebar — so an edit on one must not leave the other
 * showing a value that is no longer true. A stale panel is not merely cosmetic: it is still editable, so
 * the next click there would write back a superseded value.
 */

const PROJECT = { id: "p", path: "/p", name: "p" } as unknown as Project;


test("sections come from the project's own tokens, under their own names", async ({ mount }) => {
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);

  await expect(c.getByText("Colors")).toBeVisible();
  await expect(c.getByText("Typography")).toBeVisible();
  await expect(c.getByText("Spacing")).toBeVisible();
  await expect(c.getByText("Borders")).toBeVisible();
  await expect(c.getByText("Shadows")).toBeVisible();

  // The project's own token names, not a fixed role list. Asserted via the accessible name, because a
  // colour renders as a swatch in a grid (no visible CSS value) and a length as a two-up cell.
  await expect(c.getByLabel(/^color-accent:/)).toBeVisible();
  await expect(c.getByLabel(/^radius-card:/)).toBeVisible();
});

test("an empty section says so rather than hiding or inventing rows", async ({ mount }) => {
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);
  await c.getByRole("button", { name: /Spacing/ }).click();
  await expect(c.getByText(/defines no spacing tokens/i)).toBeVisible();
});

test("Manual and Presets are alternative modes", async ({ mount }) => {
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);

  await c.getByRole("button", { name: "Presets" }).click();
  // Default leads the list and is not a stored preset — it is the project's own design system.
  await expect(c.getByText("Default")).toBeVisible();
  await expect(c.getByText(/as your library defines it/i)).toBeVisible();
  // The token controls are gone. (The Live Preview stays above the mode switch and still names its
  // tokens — it reflects the design system in either mode, so that is correct, not a leak.)
  await expect(c.getByLabel(/^color-accent:/)).toHaveCount(0);

  await c.getByRole("button", { name: "Manual" }).click();
  await expect(c.getByLabel(/^color-accent:/)).toBeVisible();
});

test("every attribute is a visual tile; opening one reveals its value", async ({ mount }) => {
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);

  // A section is takeable at a glance — no per-token value input competing for the width. That holds for
  // lengths as much as colours: a radius is drawn as a corner, not spelled out.
  await expect(c.getByLabel(/^color-accent:/)).toBeVisible();
  await expect(c.getByLabel(/^radius-card:/)).toBeVisible();
  await expect(c.getByLabel("radius-card", { exact: true })).toHaveCount(0);
  // `exact` — the swatch's own label ("color-accent: #262626") contains the input's, so a substring
  // match would find the swatch and report the editor as already open.
  await expect(c.getByLabel("color-accent", { exact: true })).toHaveCount(0);

  // The value appears only for the swatch you open.
  await c.getByLabel(/^color-accent:/).click();
  await expect(c.getByLabel("color-accent", { exact: true })).toBeVisible();
});

test("a second mounted panel is never left stale after an edit on the first", async ({ mount }) => {
  // Both surfaces open at once, exactly as they can be in the app.
  const c = await mount(
    <div>
      <div data-testid="playground">
        <LibraryPanel project={PROJECT} onEdited={() => {}} />
      </div>
      <div data-testid="tokens">
        <LibraryPanel project={PROJECT} onEdited={() => {}} />
      </div>
    </div>,
  );

  // Open the same token's editor on both surfaces — a value is only spelled out for the tile you open.
  const p1 = c.getByTestId("playground");
  const p2 = c.getByTestId("tokens");
  await p1.getByLabel(/^radius-card:/).click();
  await p2.getByLabel(/^radius-card:/).click();

  const first = p1.getByLabel("radius-card", { exact: true });
  const second = p2.getByLabel("radius-card", { exact: true });
  await expect(first).toHaveValue("20px");
  await expect(second).toHaveValue("20px");

  await first.fill("40px");
  await first.blur();

  // The one that was edited shows the new value…
  await expect(first).toHaveValue("40px");
  // …and so does the OTHER, which would otherwise still be offering to write back "20px".
  await expect(second).toHaveValue("40px");
});

test("a per-component override is visible and clearable, not applied invisibly", async ({ mount }) => {
  // An override that applies to every instance on every page while appearing in no screen is
  // indistinguishable from a bug: the user sees an effect with no cause and no way to undo it. The
  // fixture seeds one the session did not write, which is exactly that case.
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);

  await expect(c.getByText("Component overrides")).toBeVisible();
  await expect(c.getByText("Button", { exact: true })).toBeVisible();
  await expect(c.getByText("border-radius: 0")).toBeVisible();

  await c.getByRole("button", { name: "Clear the Button override" }).click();

  await expect(c.getByText("Component overrides")).toHaveCount(0);
});

test("the design system marks what the selection is made of, and moves nothing", async ({ mount }) => {
  // Selecting a component should answer "what is this made of?" against the SAME list, in the same order.
  // A design system that rearranges itself per selection is one nobody learns.
  const plain = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);
  const orderBefore = await plain.getByLabel(/^color-/).evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label")?.split(":")[0]),
  );
  await plain.unmount();

  const c = await mount(
    <LibraryPanel project={PROJECT} onEdited={() => {}} tokensInUse={["color-accent"]} />,
  );

  // The row in use says so in its accessible name; the others are untouched.
  await expect(c.getByLabel(/^color-accent:.*in use by the selection/)).toBeVisible();
  await expect(c.getByLabel(/^color-border:.*in use by the selection/)).toHaveCount(0);

  // Same rows, same order — the marking is an annotation, not a filter.
  const orderAfter = await c.getByLabel(/^color-/).evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label")?.split(":")[0]),
  );
  expect(orderAfter).toEqual(orderBefore);
});
