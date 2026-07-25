import { describe, expect, it } from "vitest";
import { isViteProject, viteStampInjection, STAMP_WRAPPER_REL } from "./dev-stamp";

describe("isViteProject", () => {
  it("detects vite via a dependency", () => {
    expect(isViteProject({ devDependencies: { vite: "^5" } }, "dev")).toBe(true);
    expect(isViteProject({ dependencies: { vite: "^5" } }, "dev")).toBe(true);
  });
  it("detects vite via the chosen script", () => {
    expect(isViteProject({ scripts: { dev: "vite --host" } }, "dev")).toBe(true);
    expect(isViteProject({ scripts: { start: "node server && vite" } }, "start")).toBe(true);
  });
  it("is false for a non-vite project", () => {
    expect(isViteProject({ scripts: { dev: "next dev" }, devDependencies: { next: "14" } }, "dev")).toBe(false);
    expect(isViteProject(null, "dev")).toBe(false);
    // A script merely CONTAINING the substring 'vite' (e.g. 'invite') is not a match.
    expect(isViteProject({ scripts: { dev: "invitest" } }, "dev")).toBe(false);
  });
});

describe("viteStampInjection", () => {
  const base = {
    projectPath: "/Users/dev/app",
    pkg: { devDependencies: { vite: "^5" } },
    script: "dev",
    pluginModuleUrl: "/opt/vortspec/canvas/vite-plugin.js",
  };

  it("returns null for a non-vite project (fall back to the raw script)", () => {
    expect(viteStampInjection({ ...base, pm: "npm", pkg: { devDependencies: { next: "14" } } })).toBeNull();
  });

  it("spawns vite through the wrapper config with the right runner per pm", () => {
    expect(viteStampInjection({ ...base, pm: "npm", port: 5199 })!.argv).toEqual([
      "npx", "vite", "--config", STAMP_WRAPPER_REL, "--port", "5199", "--strictPort",
    ]);
    expect(viteStampInjection({ ...base, pm: "pnpm" })!.argv.slice(0, 4)).toEqual([
      "pnpm", "exec", "vite", "--config",
    ]);
    expect(viteStampInjection({ ...base, pm: "yarn" })!.argv.slice(0, 3)).toEqual(["yarn", "vite", "--config"]);
    expect(viteStampInjection({ ...base, pm: "bun" })!.argv.slice(0, 3)).toEqual(["bunx", "vite", "--config"]);
  });

  it("emits a wrapper that loads the project config and injects the stamp, scoped to the root", () => {
    const inj = viteStampInjection({ ...base, pm: "npm" })!;
    expect(inj.wrapperPath).toBe(STAMP_WRAPPER_REL);
    expect(inj.wrapperContent).toContain('loadConfigFromFile(env, undefined, "/Users/dev/app")');
    expect(inj.wrapperContent).toContain('vortspecSourceStamp({ root: "/Users/dev/app" })');
    expect(inj.wrapperContent).toContain('from "/opt/vortspec/canvas/vite-plugin.js"');
  });
});
