import { test, expect } from "@playwright/experimental-ct-react";
import { Sitemap } from "@vortspec/ui/Sitemap";
import type { RouteDiscovery } from "@vortspec/core/ipc";

const NEXT: RouteDiscovery = {
  router: "next-app",
  note: null,
  routes: [
    {
      path: "/",
      label: "Home",
      file: "app/page.tsx",
      dynamic: false,
      navigable: true,
      children: [
        { path: "/about", label: "About", file: "app/about/page.tsx", dynamic: false, navigable: true, children: [] },
        {
          path: "/blog",
          label: "Blog",
          file: null, // structural branch — no page of its own
          dynamic: false,
          navigable: false,
          children: [
            { path: "/blog/:slug", label: ":slug", file: "app/blog/[slug]/page.tsx", dynamic: true, navigable: false, children: [] },
          ],
        },
      ],
    },
  ],
};

const SCREENS: RouteDiscovery = {
  router: "none",
  note: "No router — these screens are state-navigated (no URL).",
  screenPreview: { enabled: false, param: "screen" },
  routes: [
    {
      path: "/",
      label: "Home",
      file: "src/App.tsx",
      dynamic: false,
      navigable: true,
      children: [
        {
          path: "#screen/src/screens/DestinationDetail.tsx",
          label: "Destination detail",
          file: "src/screens/DestinationDetail.tsx",
          dynamic: false,
          navigable: false,
          children: [],
        },
      ],
    },
  ],
};

const PREVIEWABLE: RouteDiscovery = {
  router: "none",
  note: "State-navigated screens (no URL).",
  screenPreview: { enabled: true, param: "screen" },
  routes: [
    {
      path: "/",
      label: "Home",
      file: "src/App.tsx",
      dynamic: false,
      navigable: true,
      children: [
        {
          path: "?screen=DestinationDetail",
          label: "Destination detail",
          file: "src/screens/DestinationDetail.tsx",
          dynamic: false,
          navigable: true,
          children: [],
        },
      ],
    },
  ],
};

test("lists the discovered pages and navigates a real page on click", async ({ mount }) => {
  const navs: string[] = [];
  const c = await mount(<Sitemap discovery={NEXT} currentPath="/" onNavigate={(p) => navs.push(p)} />);
  await expect(c.page().getByTestId("sitemap")).toContainText("Pages");
  await expect(c.getByRole("button", { name: /Home/ })).toBeVisible();
  await expect(c.getByRole("button", { name: /^About/ })).toBeVisible();
  await c.getByRole("button", { name: /^About/ }).click();
  await expect.poll(() => navs).toEqual(["/about"]);
});

test("a dynamic route and a page-less branch are shown but not navigable", async ({ mount }) => {
  const navs: string[] = [];
  const c = await mount(<Sitemap discovery={NEXT} currentPath="/" onNavigate={(p) => navs.push(p)} />);
  await expect(c.getByRole("button", { name: /:slug/ })).toBeDisabled();
  await expect(c.getByText("dynamic")).toBeVisible();
  await expect(c.getByRole("button", { name: /^Blog/ })).toBeDisabled();
  expect(navs).toEqual([]);
});

test("a state-navigated screen opens its source instead of navigating", async ({ mount }) => {
  const navs: string[] = [];
  const opened: string[] = [];
  const c = await mount(
    <Sitemap discovery={SCREENS} currentPath="/" onNavigate={(p) => navs.push(p)} onOpenFile={(f) => opened.push(f)} />,
  );
  const screen = c.getByRole("button", { name: /Destination detail/ });
  await expect(screen).toBeEnabled();
  await screen.click();
  await expect.poll(() => opened).toEqual(["src/screens/DestinationDetail.tsx"]);
  expect(navs).toEqual([]);
});

test("shows automatic screen-preview setup while the harness is being installed", async ({ mount }) => {
  const c = await mount(<Sitemap discovery={SCREENS} currentPath="/" onNavigate={() => {}} onOpenFile={() => {}} />);
  // Setup is automatic — a passive progress line, no button to press.
  await expect(c.getByTestId("screen-preview-setup")).toBeVisible();
  await expect(c.getByTestId("screen-preview-setup")).toContainText("Setting up");
  await expect(c.getByTestId("retry-screen-preview")).toHaveCount(0);
});

test("offers a retry only when automatic setup failed", async ({ mount }) => {
  let retried = 0;
  const c = await mount(
    <Sitemap
      discovery={SCREENS}
      currentPath="/"
      onNavigate={() => {}}
      onOpenFile={() => {}}
      screenPreviewState="failed"
      onRetryScreenPreview={() => (retried += 1)}
    />,
  );
  await c.getByTestId("retry-screen-preview").click();
  await expect.poll(() => retried).toBe(1);
});

test("a previewable screen navigates the preview (no setup prompt)", async ({ mount }) => {
  const navs: string[] = [];
  const opened: string[] = [];
  const c = await mount(
    <Sitemap discovery={PREVIEWABLE} currentPath="/" onNavigate={(p) => navs.push(p)} onOpenFile={(f) => opened.push(f)} />,
  );
  await expect(c.getByTestId("screen-preview-setup")).toHaveCount(0);
  const screen = c.getByRole("button", { name: /Destination detail/ });
  await expect(screen).toBeEnabled();
  await screen.click();
  await expect.poll(() => navs).toEqual(["?screen=DestinationDetail"]);
  expect(opened).toEqual([]);
});

test("shows the discovery note when there are no pages", async ({ mount }) => {
  const c = await mount(
    <Sitemap
      discovery={{ router: "none", routes: [], note: "No router detected — this looks like a single-page app." }}
      currentPath="/"
      onNavigate={() => {}}
    />,
  );
  await expect(c.page().getByTestId("sitemap")).toContainText("single-page app");
});
