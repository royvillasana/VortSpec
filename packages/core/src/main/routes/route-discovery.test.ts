import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { discoverRoutes } from "./route-discovery";
import { buildRouteTree, humanizeSegment, type RouteNode } from "../../shared/routes";

async function write(dir: string, rel: string, content = "export default function P(){return null}\n"): Promise<void> {
  await mkdir(join(dir, dirname(rel)), { recursive: true });
  await writeFile(join(dir, rel), content, "utf8");
}

/** Flatten the tree to a sorted list of paths for concise assertions. */
function paths(nodes: RouteNode[]): string[] {
  const out: string[] = [];
  const walk = (n: RouteNode): void => {
    out.push(n.path);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out.sort();
}

describe("humanizeSegment / buildRouteTree", () => {
  it("humanizes segments and dynamic params", () => {
    expect(humanizeSegment("user-settings")).toBe("User settings");
    expect(humanizeSegment("[slug]")).toBe(":slug");
    expect(humanizeSegment("blog")).toBe("Blog");
  });

  it("nests routes under shared prefixes with Home as the root", () => {
    const tree = buildRouteTree([
      { path: "/", file: "app/page.tsx" },
      { path: "/blog", file: "app/blog/page.tsx" },
      { path: "/blog/:slug", file: "app/blog/[slug]/page.tsx" },
    ]);
    expect(tree[0].path).toBe("/");
    expect(tree[0].label).toBe("Home");
    expect(paths(tree)).toEqual(["/", "/blog", "/blog/:slug"]);
    const blog = tree[0].children.find((c) => c.path === "/blog")!;
    expect(blog.children[0].dynamic).toBe(true);
  });
});

describe("discoverRoutes", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-routes-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("maps a Next.js app/ directory to routes (groups drop, [param] → :param)", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "14" } }), "utf8");
    await write(dir, "app/page.tsx");
    await write(dir, "app/about/page.tsx");
    await write(dir, "app/blog/[slug]/page.tsx");
    await write(dir, "app/(marketing)/pricing/page.tsx");
    await write(dir, "app/layout.tsx"); // not a route
    const r = await discoverRoutes(dir);
    expect(r.router).toBe("next-app");
    // `/blog` is a structural branch grouping the dynamic `/blog/:slug` page.
    expect(paths(r.routes)).toEqual(["/", "/about", "/blog", "/blog/:slug", "/pricing"]);
  });

  it("maps a Next.js pages/ directory, skipping _app and api/", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "13" } }), "utf8");
    await write(dir, "pages/index.tsx");
    await write(dir, "pages/about.tsx");
    await write(dir, "pages/blog/[slug].tsx");
    await write(dir, "pages/_app.tsx"); // skipped
    await write(dir, "pages/api/hello.ts"); // skipped
    const r = await discoverRoutes(dir);
    expect(r.router).toBe("next-pages");
    expect(paths(r.routes)).toEqual(["/", "/about", "/blog", "/blog/:slug"]);
  });

  it("parses react-router <Route path> definitions from source (best-effort)", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { "react-router-dom": "6" } }), "utf8");
    await write(
      dir,
      "src/routes.tsx",
      `import { Routes, Route } from "react-router-dom";\nexport default () => (<Routes><Route path="/" element={<Home/>}/><Route path="/about" element={<About/>}/><Route path="/blog/:id" element={<Post/>}/></Routes>);\n`,
    );
    const r = await discoverRoutes(dir);
    expect(r.router).toBe("react-router");
    expect(paths(r.routes)).toEqual(["/", "/about", "/blog", "/blog/:id"]);
  });

  it("falls back to a single Home for a router-less single-page app", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "18", vite: "5" } }), "utf8");
    await write(dir, "src/App.tsx");
    const r = await discoverRoutes(dir);
    expect(r.router).toBe("none");
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]).toMatchObject({ path: "/", label: "Home", file: "src/App.tsx" });
    expect(r.note).toMatch(/single-page/);
  });
});
