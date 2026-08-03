import { test, expect } from "@playwright/experimental-ct-react";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
import type { BridgeTree, InspectorToken, Selection } from "@vortspec/core/ipc";

/**
 * The scope of a style edit (change: scoped-style-edits, Phase 1).
 *
 * What these defend is not that a selector renders — it is that the user is TOLD how far an edit reaches
 * before they can commit it, and that the scope they were shown is the scope that gets reported. A wide
 * edit is easy to make and hard to notice; every test here is about not making one by accident.
 */

const node = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag,
  classes: [],
  childCount: 0,
  ...extra,
});

// Three Buttons and one Card on the page, so a component count is a real number and not a fixture of one.
const TREE = {
  roots: ["root"],
  nodes: {
    root: node("div"),
    b1: node("button", { component: "Button" }),
    b2: node("button", { component: "Button" }),
    b3: node("button", { component: "Button" }),
    card: node("div", { component: "Card" }),
  },
  children: { root: ["b1", "b2", "b3", "card"] },
} as unknown as BridgeTree;

const TOKENS = [
  { name: "radius-card", type: "radius", rawValue: "20px", resolvedValue: "20px", source: "css", uses: 40 },
] as unknown as InspectorToken[];

/**
 * A Button with one editable property.
 *
 * `kind: "text"` on purpose: the scope row is kind-agnostic, and a `length` field renders a token CHIP
 * whose own "Raw value" interaction would be what the test was really driving. Using the plain control
 * keeps these about scope, which is what is under test.
 */
const selection = (opts: { component: string | null; token: string | null }): Selection =>
  ({
    nodeId: "b1",
    label: opts.component ?? "button",
    component: opts.component,
    rect: { x: 0, y: 0, width: 100, height: 40 },
    variants: [],
    sections: [
      {
        id: "appearance",
        title: "Appearance",
        fields: [
          {
            key: "radius",
            label: "Radius",
            kind: "text",
            value: "20px",
            token: opts.token,
            tokenType: "radius",
            options: [],
          },
        ],
      },
    ],
  }) as unknown as Selection;

const panel = (sel: Selection, onFieldChange?: (...a: unknown[]) => void) => (
  <DesignPanel
    storageKey={`scope-${Math.random()}`}
    selection={sel}
    tree={TREE}
    tokens={TOKENS}
    onSelectNode={() => {}}
    onFieldChange={onFieldChange as never}
  />
);

test("the scope is shown before a value can be typed, with each reach stated", async ({ mount }) => {
  const c = await mount(panel(selection({ component: "Button", token: "radius-card" })));

  // Nothing until the field is engaged — a scope row under every field at rest is chrome, not information.
  await expect(c.getByRole("group", { name: "Apply to" })).toHaveCount(0);

  await c.getByRole("textbox").first().focus();
  const scopes = c.getByRole("group", { name: "Apply to" });
  await expect(scopes).toBeVisible();

  // The token reach is a real number the design system supplies. The "looks like this" reach has no
  // number yet: only the guest can say which siblings actually match, and inventing one here would sweep
  // up Buttons that were styled differently on purpose.
  await expect(scopes.getByRole("button", { name: "This element" })).toBeVisible();
  await expect(scopes.getByRole("button", { name: "Buttons like this" })).toBeVisible();
  await expect(scopes.getByRole("button", { name: "--radius-card · 40 uses" })).toBeVisible();
});

test("the default points at the token, but confined to the component", async ({ mount }) => {
  const c = await mount(panel(selection({ component: "Button", token: "radius-card" })));
  await c.getByRole("textbox").first().focus();

  // Editing the instance would fight the design system, so the default points at the token. But writing
  // the token outright would also change every OTHER component reading it — so the default is the token
  // scoped to this component, which satisfies the principle without the spill.
  await expect(c.getByRole("button", { name: "All 3 Buttons" })).toHaveAttribute("aria-pressed", "true");
  await expect(c.getByRole("button", { name: "--radius-card · 40 uses" })).toHaveAttribute("aria-pressed", "false");
  await expect(c.getByRole("button", { name: "Buttons like this" })).toHaveAttribute("aria-pressed", "false");
});

test("the default falls to \"looks like this\" when no token governs the property", async ({ mount }) => {
  const c = await mount(panel(selection({ component: "Button", token: null })));
  await c.getByRole("textbox").first().focus();

  await expect(c.getByRole("button", { name: "Buttons like this" })).toHaveAttribute("aria-pressed", "true");
  // With no token there is nothing to offer at token scope — the option is withheld, not shown disabled.
  await expect(c.getByRole("button", { name: /radius-card/ })).toHaveCount(0);
});

test("an unmarked element is not offered a component scope", async ({ mount }) => {
  const c = await mount(panel(selection({ component: null, token: null })));
  await c.getByRole("textbox").first().focus();

  // One available scope means no choice to present, so the row itself is withheld.
  await expect(c.getByRole("group", { name: "Apply to" })).toHaveCount(0);
});

test("the edit is reported at the scope that was on screen", async ({ mount }) => {
  const calls: unknown[][] = [];
  const c = await mount(
    panel(selection({ component: "Button", token: "radius-card" }), (...a) => calls.push(a)),
  );

  const input = c.getByRole("textbox").first();
  await input.focus();
  // Choose the narrower scope explicitly, overriding the derived default.
  await c.getByRole("button", { name: "This element" }).click();
  await input.fill("4px");
  await input.press("Enter");

  await expect.poll(() => calls.length).toBeGreaterThan(0);
  const [key, value, scope] = calls[calls.length - 1];
  expect(key).toBe("radius");
  expect(value).toBe("4px");
  expect(scope).toBe("element");
});

test("choosing \"looks like this\" reports that scope and the component it keys on", async ({ mount }) => {
  const calls: unknown[][] = [];
  const c = await mount(
    panel(selection({ component: "Button", token: null }), (...a) => calls.push(a)),
  );

  const input = c.getByRole("textbox").first();
  await input.focus();
  await c.getByRole("button", { name: "Buttons like this" }).click();
  await input.fill("0px");
  await input.press("Enter");

  await expect.poll(() => calls.length).toBeGreaterThan(0);
  const [, , scope, scopeKey] = calls[calls.length - 1];
  expect(scope).toBe("matching");
  expect(scopeKey).toBe("Button");
});

test("hardcoding over a token offers to change the token instead", async ({ mount }) => {
  // The edit the user asked for is already applied when the offer appears. It is an offer precisely
  // because the narrow edit is legitimate — but next time anything re-reads the design system, the token
  // wins, so the system is usually what they meant to change.
  const calls: unknown[][] = [];
  const c = await mount(
    panel(selection({ component: "Button", token: "radius-card" }), (...a) => calls.push(a)),
  );

  const input = c.getByRole("textbox").first();
  await input.focus();
  await c.getByRole("button", { name: "This element" }).click();
  await input.fill("4px");
  await input.press("Enter");

  // The element edit landed first, unconditionally.
  expect(calls.at(-1)?.[2]).toBe("element");

  // Then the offer, naming the token and how far accepting would reach.
  await expect(c.getByText(/--radius-card decides this/)).toBeVisible();
  await expect(c.getByText(/40 uses/)).toBeVisible();

  await c.getByRole("button", { name: "Change the token" }).click();
  const [, value, scope, scopeKey] = calls.at(-1) as unknown[];
  expect(value).toBe("4px");
  expect(scope).toBe("token");
  expect(scopeKey).toBe("radius-card");
});

test("declining the promotion leaves the element edit exactly as made", async ({ mount }) => {
  const calls: unknown[][] = [];
  const c = await mount(
    panel(selection({ component: "Button", token: "radius-card" }), (...a) => calls.push(a)),
  );

  const input = c.getByRole("textbox").first();
  await input.focus();
  await c.getByRole("button", { name: "This element" }).click();
  await input.fill("4px");
  await input.press("Enter");

  const before = calls.length;
  await c.getByRole("button", { name: "Keep the change on this element" }).click();

  // Dismissing writes nothing at all — the token is untouched and the element edit stands.
  await expect(c.getByText(/decides this/)).toHaveCount(0);
  expect(calls.length).toBe(before);
  expect(calls.at(-1)?.[2]).toBe("element");
});

test("no promotion is offered when the members share no token", async ({ mount }) => {
  const c = await mount(panel(selection({ component: "Button", token: null })));
  const input = c.getByRole("textbox").first();
  await input.focus();
  await c.getByRole("button", { name: "This element" }).click();
  await input.fill("4px");
  await input.press("Enter");

  await expect(c.getByText(/decides this/)).toHaveCount(0);
});

test("a shared token AND component scopes the token to the component, sparing its siblings", async ({
  mount,
}) => {
  // The whole point: `--radius-card` may also be read by a Button. Writing the token would change the
  // Button too, so "every Button" is expressed as the SAME token redefined inside the component.
  const calls: unknown[][] = [];
  const c = await mount(
    panel(selection({ component: "Button", token: "radius-card" }), (...a) => calls.push(a)),
  );
  const input = c.getByRole("textbox").first();
  await input.focus();

  // Both wide scopes are offered side by side, and they are different questions: the ones that look alike
  // today, and every instance by identity.
  const scopes = c.getByRole("group", { name: "Apply to" });
  await expect(scopes.getByRole("button", { name: "Buttons like this" })).toBeVisible();
  await expect(scopes.getByRole("button", { name: "All 3 Buttons" })).toBeVisible();
  await expect(scopes.getByRole("button", { name: /radius-card/ })).toBeVisible();

  // And the component-scoped one is the default: it points at the token without the spill.
  await expect(scopes.getByRole("button", { name: "All 3 Buttons" })).toHaveAttribute("aria-pressed", "true");

  await input.fill("4px");
  await input.press("Enter");
  const [, value, scope, scopeKey, scopeToken] = calls.at(-1) as unknown[];
  expect(value).toBe("4px");
  expect(scope).toBe("component-token");
  expect(scopeKey).toBe("Button");
  expect(scopeToken).toBe("radius-card");
});

test("the token scope still reaches everything, and says so", async ({ mount }) => {
  const calls: unknown[][] = [];
  const c = await mount(
    panel(selection({ component: "Button", token: "radius-card" }), (...a) => calls.push(a)),
  );
  const input = c.getByRole("textbox").first();
  await input.focus();

  // Choosing the token deliberately is still one click, wearing its use count so the reach is legible.
  await c.getByRole("button", { name: "--radius-card · 40 uses" }).click();
  await input.fill("4px");
  await input.press("Enter");

  const [, , scope, scopeKey] = calls.at(-1) as unknown[];
  expect(scope).toBe("token");
  expect(scopeKey).toBe("radius-card");
});
