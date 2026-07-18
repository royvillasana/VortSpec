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
      children: [
        { path: "/about", label: "About", file: "app/about/page.tsx", dynamic: false, children: [] },
        {
          path: "/blog",
          label: "Blog",
          file: null, // structural branch — no page of its own
          dynamic: false,
          children: [{ path: "/blog/:slug", label: ":slug", file: "app/blog/[slug]/page.tsx", dynamic: true, children: [] }],
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
