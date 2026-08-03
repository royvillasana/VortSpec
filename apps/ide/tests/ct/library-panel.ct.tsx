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
    <LibraryPanel project={PROJECT} onEdited={() => {}} tokensInUse={{ "color-accent": "#262626" }} />,
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

test("a token the design system lacks is named, not silently absent", async ({ mount }) => {
  // A light page routinely declares its own `:root`, so a component built on a token the design system
  // never defined is the common case. Showing nothing for that property answers "what is this made of?"
  // with silence, which reads as a broken panel rather than as the drift it actually is.
  const c = await mount(
    <LibraryPanel
      project={PROJECT}
      onEdited={() => {}}
      tokensInUse={{
        "color-accent": "#262626", // the design system HAS this one
        "radius-pill": "999px", // …and not this one
      }}
    />,
  );

  const missing = c.getByRole("region", { name: /not in your design system/i });
  await expect(missing).toBeVisible();
  await expect(missing.getByText("--radius-pill")).toBeVisible();
  await expect(missing.getByText(/999px/)).toBeVisible();

  // The one it HAS is marked in place among its own rows, and is NOT listed as missing. Scoped to the
  // region: the Live Preview also names the tokens it drew with, so an unscoped match would find it there.
  await expect(c.getByLabel(/^color-accent:.*in use by the selection/)).toBeVisible();
  await expect(missing.getByText("--color-accent")).toHaveCount(0);
});

test("nothing is claimed when the selection is fully mapped", async ({ mount }) => {
  const c = await mount(
    <LibraryPanel project={PROJECT} onEdited={() => {}} tokensInUse={{ "color-accent": "#262626" }} />,
  );
  await expect(c.getByRole("region", { name: /not in your design system/i })).toHaveCount(0);
});

test("adopting adds the token to the design system, and only on request", async ({ mount }) => {
  const c = await mount(
    <LibraryPanel project={PROJECT} onEdited={() => {}} tokensInUse={{ "radius-pill": "999px" }} />,
  );

  // Selecting something must never modify the design system on its own.
  await expect(c.getByLabel(/^radius-pill:/)).toHaveCount(0);

  await c.getByRole("button", { name: "Add --radius-pill to the design system" }).click();

  // Now it IS the design system: a row of its own, and no longer listed as missing.
  await expect(c.getByLabel(/^radius-pill:/)).toBeVisible();
  await expect(c.getByRole("region", { name: /not in your design system/i })).toHaveCount(0);
});

test("editing a token with a component selected asks how far it reaches", async ({ mount }) => {
  // Ambiguous by construction: the user is looking at one Card, and the token belongs to every component
  // that reads it. Guessing is wrong half the time — and invisibly so, because the Card changes either
  // way and only the components they were NOT looking at reveal which reading was taken.
  const c = await mount(
    <LibraryPanel
      project={PROJECT}
      onEdited={() => {}}
      tokensInUse={{ "radius-card": "20px" }}
      selectedComponent="Card"
    />,
  );

  // Edited from the component's own applied view — where a user looking at a Card would reach for it.
  const applied = c.getByRole("region", { name: "Applied styles: Card" });
  await applied.getByLabel(/^radius-card:/).click();
  const input = applied.getByLabel("radius-card", { exact: true });
  await input.fill("4px");
  await input.blur();

  const ask = c.getByRole("alertdialog", { name: /Apply --radius-card/ });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Only Cards" })).toBeVisible();
  await expect(ask.getByRole("button", { name: "The whole design system" })).toBeVisible();
  // It says what the narrow choice spares, so the decision is made on consequences.
  await expect(ask.getByText(/leaves other components reading --radius-card alone/i)).toBeVisible();
});

test("with nothing selected there is nothing to ask", async ({ mount }) => {
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);

  await c.getByLabel(/^radius-card:/).click();
  const input = c.getByLabel("radius-card", { exact: true });
  await input.fill("4px");
  await input.blur();

  // No selection, no ambiguity: the edit is the design system's, and it just applies.
  await expect(c.getByRole("alertdialog")).toHaveCount(0);
  await expect(input).toHaveValue("4px");
});

test("cancelling the question applies neither reading", async ({ mount }) => {
  const c = await mount(
    <LibraryPanel
      project={PROJECT}
      onEdited={() => {}}
      tokensInUse={{ "radius-card": "20px" }}
      selectedComponent="Card"
    />,
  );

  const applied = c.getByRole("region", { name: "Applied styles: Card" });
  await applied.getByLabel(/^radius-card:/).click();
  const input = applied.getByLabel("radius-card", { exact: true });
  await input.fill("4px");
  await input.blur();
  await c.getByRole("button", { name: "Cancel this change" }).click();

  await expect(c.getByRole("alertdialog")).toHaveCount(0);
  // The design system is untouched — the row still reads what it did.
  await expect(applied.getByLabel(/^radius-card: 20px/)).toBeVisible();
});

test("a selected component's styles are collected under its name, grouped and counted", async ({
  mount,
}) => {
  // Marking answers "is this one used?". It does not answer "what is this Card made of?" — that answer
  // was scattered across five sections of a list hundreds of rows long, found by hunting for highlights.
  const c = await mount(
    <LibraryPanel
      project={PROJECT}
      onEdited={() => {}}
      tokensInUse={{ "color-accent": "#262626", "radius-card": "20px" }}
      selectedComponent="Card"
    />,
  );

  const applied = c.getByText("Applied styles");
  await expect(applied).toBeVisible();
  await expect(c.getByText("Card", { exact: true })).toBeVisible();

  // One group per kind the component actually uses, each stating how much.
  await expect(c.getByText("Colors")).toHaveCount(2); // the applied view + the design system below
  await expect(c.getByText("Borders")).toHaveCount(2);

  // A kind it uses nothing from is not invented: the fixture has no typography/spacing/shadow in use.
  await expect(c.getByText("Typography")).toHaveCount(1); // the design system's own section only
});

test("the applied view leads, and leaves the design system below untouched", async ({ mount }) => {
  const plain = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);
  const before = await plain.getByLabel(/^color-/).evaluateAll((els) => els.length);
  await plain.unmount();

  const c = await mount(
    <LibraryPanel
      project={PROJECT}
      onEdited={() => {}}
      tokensInUse={{ "color-accent": "#262626" }}
      selectedComponent="Card"
    />,
  );

  // The design system is the same design system whatever is selected — the component view is a lead,
  // not a filter. The accent now appears twice: once in the applied view, once in its own section.
  const after = await c.getByLabel(/^color-/).evaluateAll((els) => els.length);
  expect(after).toBe(before + 1);
});

test("nothing selected, nothing led with", async ({ mount }) => {
  const c = await mount(<LibraryPanel project={PROJECT} onEdited={() => {}} />);
  await expect(c.getByText("Applied styles")).toHaveCount(0);
});
