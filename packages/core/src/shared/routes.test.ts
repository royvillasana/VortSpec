import { describe, expect, it } from "vitest";
import { buildScreenList, type RouteNode } from "./routes";

const home: RouteNode = {
  path: "/",
  label: "Home",
  file: "src/main.tsx",
  dynamic: false,
  navigable: false,
  children: [],
};
const child = (out: RouteNode[], label: string): RouteNode =>
  out[0].children.find((c) => c.label === label)!;

describe("buildScreenList — state-navigated screens", () => {
  it("navigates a screen registered by its exact name", () => {
    const out = buildScreenList(
      home,
      [{ label: "StoreLanding", file: "src/pages/StoreLanding.tsx", name: "StoreLanding" }],
      { param: "screen", screens: [{ name: "StoreLanding", file: "src/pages/StoreLanding.tsx" }] },
    );
    expect(child(out, "StoreLanding")).toMatchObject({ navigable: true, path: "?screen=StoreLanding" });
  });

  it("reconciles by FILE when the manifest registers the component under variant names", () => {
    // Regression: one ProductDetail.tsx registered only as ProductDetailMac / iPhone / … used to
    // be non-navigable (name mismatch) → clicking opened the source file instead of the page.
    const out = buildScreenList(
      home,
      [{ label: "ProductDetail", file: "src/pages/product-detail/ProductDetail.tsx", name: "ProductDetail" }],
      {
        param: "screen",
        screens: [
          { name: "ProductDetailMac", file: "src/pages/product-detail/ProductDetail.tsx" },
          { name: "ProductDetailiPhone", file: "src/pages/product-detail/ProductDetail.tsx" },
        ],
      },
    );
    expect(child(out, "ProductDetail")).toMatchObject({ navigable: true, path: "?screen=ProductDetailMac" });
  });

  it("opens the source file when the screen isn't in the manifest at all", () => {
    const out = buildScreenList(
      home,
      [{ label: "Orphan", file: "src/pages/Orphan.tsx", name: "Orphan" }],
      { param: "screen", screens: [] },
    );
    expect(child(out, "Orphan")).toMatchObject({ navigable: false, path: "#screen/src/pages/Orphan.tsx" });
  });
});
