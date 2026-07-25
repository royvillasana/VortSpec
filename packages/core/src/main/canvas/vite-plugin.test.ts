import { describe, expect, it } from "vitest";
import { vortspecSourceStamp, stampWrapperConfig } from "./vite-plugin";

describe("vortspecSourceStamp plugin", () => {
  const p = vortspecSourceStamp({ root: "/proj" });

  it("is a dev-only, pre-enforced plugin", () => {
    expect(p.apply).toBe("serve"); // never in `vite build`
    expect(p.enforce).toBe("pre"); // stamp JSX before React compiles it
    expect(p.name).toBe("vortspec:source-stamp");
  });

  it("stamps a project .tsx with a project-relative data-source", () => {
    const res = p.transform!(`export const A = () => <div className="x">hi</div>;\n`, "/proj/src/A.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toMatch(/data-source="src\/A\.tsx:1:23"/);
  });

  it("ignores non-JSX, node_modules, and query-suffixed ids", () => {
    expect(p.transform!("const n = 1;\n", "/proj/src/util.ts")).toBeNull();
    expect(p.transform!("<div/>", "/proj/node_modules/pkg/index.tsx")).toBeNull();
    // A `.ts?worker`-style id with no JSX extension is skipped.
    expect(p.transform!("const n=1", "/proj/src/w.ts?worker")).toBeNull();
  });

  it("returns null (no-op) when nothing to stamp", () => {
    expect(p.transform!("export const n = 1;\n", "/proj/src/x.tsx")).toBeNull();
  });
});

describe("stampWrapperConfig", () => {
  it("wraps the project config and appends the plugin, scoped to the root", () => {
    const cfg = stampWrapperConfig("/Users/dev/app", "file:///opt/vortspec/canvas/vite-plugin.js");
    expect(cfg).toContain('loadConfigFromFile(env, undefined, "/Users/dev/app")');
    expect(cfg).toContain("mergeConfig");
    expect(cfg).toContain('vortspecSourceStamp({ root: "/Users/dev/app" })');
    expect(cfg).toContain('from "file:///opt/vortspec/canvas/vite-plugin.js"');
  });
});
