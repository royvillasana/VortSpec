import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, stat, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { frameworkSchema } from "./setup";
import {
  ALL_SOURCE_EXTS,
  FRAMEWORK_PROFILES,
  GENERATED_DIRS,
  sanitizeComponentDir,
  vanillaCheckCmd,
  isNonComponentStem,
  profileFor,
  resolveTypecheck,
  sourceExtsFor,
  stripFileSuffix,
} from "./framework-profiles";

const FRAMEWORKS = frameworkSchema.options;

describe("FRAMEWORK_PROFILES", () => {
  it("has a row for every framework the setup schema offers", () => {
    // The menu is the promise; a missing row is a framework we ship without supporting.
    for (const f of FRAMEWORKS) expect(FRAMEWORK_PROFILES[f], `no profile for ${f}`).toBeDefined();
  });

  it("declares every profile's source extensions inside the shared union", () => {
    for (const f of FRAMEWORKS) {
      for (const ext of FRAMEWORK_PROFILES[f].sourceExts) {
        expect(ALL_SOURCE_EXTS, `${ext} (${f}) missing from ALL_SOURCE_EXTS`).toContain(ext);
      }
    }
  });

  it("orders the union so a shorter extension never shadows a longer one", () => {
    // `SOURCE_EXTS.find(e => name.endsWith(e))` takes the FIRST match, so `.ts` appearing
    // before `.tsx` would slice the stem wrong.
    for (const [i, ext] of ALL_SOURCE_EXTS.entries()) {
      for (const longer of ALL_SOURCE_EXTS.slice(i + 1)) {
        expect(longer.endsWith(ext), `${ext} at ${i} shadows ${longer}`).toBe(false);
      }
    }
  });
});

describe("resolveTypecheck", () => {
  // The regression this whole change exists for: `tsc` cannot parse these at all, so the
  // CODE layer used to pass without reading a single line of the component.
  it.each([
    ["vue", "vue-tsc"],
    ["nuxt", "nuxi typecheck"],
    ["svelte", "svelte-check"],
    ["sveltekit", "svelte-check"],
    ["astro", "astro check"],
  ])("gives %s a checker that can actually parse its files (%s)", (framework, expected) => {
    const r = resolveTypecheck(framework);
    expect(r.kind).toBe("cmd");
    expect(r.kind === "cmd" && r.cmd).toContain(expected);
    // Anchored on the BARE invocation: `npx vue-tsc` legitimately contains "tsc --noEmit".
    expect(r.kind === "cmd" && r.cmd).not.toContain("npx tsc ");
  });

  it("does not settle for bare vue-tsc on Nuxt, whose generated types it would miss", () => {
    const r = resolveTypecheck("nuxt");
    expect(r.kind === "cmd" && r.cmd).not.toBe("npx vue-tsc --noEmit");
  });

  it("checks Angular with a build, because tsc never reads the template", () => {
    const r = resolveTypecheck("angular");
    expect(r.kind === "cmd" && r.cmd).toContain("ng build");
  });

  it("keeps plain tsc for the frameworks whose components really are .ts/.tsx", () => {
    expect(resolveTypecheck("react")).toEqual({ kind: "cmd", cmd: "npx tsc --noEmit" });
    expect(resolveTypecheck("next")).toEqual({ kind: "cmd", cmd: "npx tsc --noEmit" });
  });

  // FAIL CLOSED. These three are the whole point: a check that cannot run must be
  // distinguishable from a check that passed, or we rebuild the false-green class one layer up.
  // Vanilla used to have no runnable check at all, which made it permanently BLOCKED — honest,
  // but unable to ever pass. `node --check` ships with Node and exits non-zero on a syntax
  // error, so it is a gate that can actually fail.
  it("gives vanilla a real, bundled, failable check instead of no gate at all", () => {
    const r = resolveTypecheck("vanilla");
    expect(r.kind).toBe("cmd");
    expect(r.kind === "cmd" && r.cmd).toContain("node --check");
    expect(r.kind === "cmd" && r.cmd).not.toContain("npx tsc");
  });

  it("marks vanilla's check PARTIAL, so its pass is never read as full coverage", () => {
    const r = resolveTypecheck("vanilla");
    expect(r.kind === "cmd" && r.partial).toMatch(/JS syntax only/);
  });

  it("leaves supported frameworks' checks unqualified", () => {
    const r = resolveTypecheck("react");
    expect(r.kind === "cmd" && r.partial).toBeUndefined();
  });

  it("fails closed on an unknown framework instead of quietly running React's tsc", () => {
    const r = resolveTypecheck("brand-new-framework");
    expect(r.kind).toBe("unknown");
    expect(JSON.stringify(r)).not.toContain("tsc");
  });

  it("fails closed when no framework is configured at all", () => {
    expect(resolveTypecheck(undefined)).toEqual({ kind: "unknown", framework: null });
    expect(resolveTypecheck("")).toEqual({ kind: "unknown", framework: null });
  });
});

describe("fail-closed vs fail-open", () => {
  it("refuses a profile for an unknown framework", () => {
    expect(profileFor("brand-new-framework")).toBeNull();
    expect(profileFor(undefined)).toBeNull();
  });

  it("still SEARCHES widely for an unknown framework — a wide net cannot fake a pass", () => {
    // Deliberate asymmetry: claims fail closed, file search falls back to the union.
    expect(sourceExtsFor("brand-new-framework")).toEqual(ALL_SOURCE_EXTS);
    expect(sourceExtsFor("angular")).toEqual([".ts"]);
  });
});

describe("component vs sibling files", () => {
  it("does not treat an Angular template as a component", () => {
    // `.html` is a vanilla component but an Angular TEMPLATE; scoping by framework is what
    // stops every `button.component.html` counting as its own component.
    expect(FRAMEWORK_PROFILES.angular.sourceExts).not.toContain(".html");
    expect(FRAMEWORK_PROFILES.vanilla.sourceExts).toContain(".html");
  });

  it.each([["button.stories"], ["button.test"], ["button.variants"]])(
    "excludes %s from component counts in every framework",
    (stem) => {
      expect(isNonComponentStem(stem)).toBe(true);
    },
  );

  it("excludes Angular's module/service siblings but keeps the component itself", () => {
    const angular = FRAMEWORK_PROFILES.angular;
    expect(isNonComponentStem("app.module", angular)).toBe(true);
    expect(isNonComponentStem("data.service", angular)).toBe(true);
    expect(isNonComponentStem("button.component", angular)).toBe(false);
  });
});

describe("storybookInitType is table-driven", () => {
  it("carries a Storybook type for every framework, so no consumer keeps its own switch", () => {
    for (const f of FRAMEWORKS) {
      expect(FRAMEWORK_PROFILES[f].storybookType, `no storybookType for ${f}`).toBeTruthy();
    }
  });
});

describe("support level", () => {
  it("labels vanilla experimental — its check cannot cover HTML", () => {
    expect(FRAMEWORK_PROFILES.vanilla.supportLevel).toBe("experimental");
  });

  it("labels the frameworks with a complete native checker as supported", () => {
    for (const f of ["react", "vue", "svelte", "angular", "astro"] as const) {
      expect(FRAMEWORK_PROFILES[f].supportLevel).toBe("supported");
    }
  });
});

describe("the table is immutable and exhaustive", () => {
  it("is frozen DEEPLY — the nested arrays too, not just the records", () => {
    expect(Object.isFrozen(FRAMEWORK_PROFILES)).toBe(true);
    for (const f of FRAMEWORKS) {
      expect(Object.isFrozen(FRAMEWORK_PROFILES[f]), `${f} record`).toBe(true);
      expect(Object.isFrozen(FRAMEWORK_PROFILES[f].sourceExts), `${f}.sourceExts`).toBe(true);
      expect(Object.isFrozen(FRAMEWORK_PROFILES[f].fileSuffixes), `${f}.fileSuffixes`).toBe(true);
      expect(
        Object.isFrozen(FRAMEWORK_PROFILES[f].nonComponentSuffixes),
        `${f}.nonComponentSuffixes`,
      ).toBe(true);
    }
  });

  it("gives each framework its own record, so editing one never changes another", () => {
    // Vue and Nuxt looked identical until Nuxt needed `nuxi typecheck`; shared identity would
    // have made that edit silently change Vue too.
    expect(FRAMEWORK_PROFILES.vue).not.toBe(FRAMEWORK_PROFILES.nuxt);
    expect(FRAMEWORK_PROFILES.react).not.toBe(FRAMEWORK_PROFILES.next);
  });
});

describe("stripFileSuffix", () => {
  it("strips Angular's .component so the file matches its roster entry", () => {
    // `button.component` normalized to `buttoncomponent`, never equalled `button`, and so
    // every Angular component read as unbuilt on every launch.
    expect(stripFileSuffix("button.component")).toBe("button");
  });

  it("leaves an ordinary stem alone", () => {
    expect(stripFileSuffix("Button")).toBe("Button");
    expect(stripFileSuffix("color-picker")).toBe("color-picker");
  });

  it("does not strip a story or variants stem into a false match", () => {
    expect(stripFileSuffix("button.stories")).toBe("button.stories");
    expect(stripFileSuffix("button.variants")).toBe("button.variants");
  });
});

describe("profileFor", () => {
  it("covers Astro and vanilla component files, which the old local list dropped", () => {
    expect(profileFor("astro")?.sourceExts).toContain(".astro");
    expect(profileFor("vanilla")?.sourceExts).toContain(".html");
  });

  it("is case-insensitive, so a capitalized project.yaml value still resolves", () => {
    expect(profileFor("Svelte")?.typecheckCmd).toContain("svelte-check");
  });
});

/**
 * The vanilla gate is a real shell command, so it is proved by RUNNING it, not by asserting
 * on its string. An unscoped sweep failed on generated JS nobody authored — a broken
 * `dist/bundle.js` or `.vortspec` cache would block component source that is perfectly fine.
 */
describe("vanillaCheckCmd — scoped to source, executed for real", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-vanilla-check-"));
    await mkdir(join(dir, "src", "components"), { recursive: true });
    // Generated / tool output that must never gate a component build.
    for (const d of ["dist", "build", ".vortspec", ".sdd-de", "storybook-static", "node_modules"]) {
      await mkdir(join(dir, d), { recursive: true });
      await writeFile(join(dir, d, "generated.js"), "this is ) not { valid js\n", "utf8");
    }
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const run = (cmd: string): number => {
    const r = spawnSync("sh", ["-c", cmd], { cwd: dir, encoding: "utf8" });
    return r.status ?? -1;
  };

  it("passes on valid source even when every generated tree contains broken JS", async () => {
    await writeFile(join(dir, "src", "components", "button.js"), "export const ok = 1;\n", "utf8");
    expect(run(vanillaCheckCmd("src/components")!)).toBe(0);
  });

  it("still FAILS on a real syntax error in the component source itself", async () => {
    // The gate has to be able to fail, or scoping it would just be a nicer false green.
    // Note the sample: Node tolerates some malformed-looking ESM in a `.js` file with no
    // `"type": "module"`, so this uses an unclosed brace — unambiguously invalid in any mode.
    await writeFile(join(dir, "src", "components", "broken.js"), "if (true) {\n", "utf8");
    expect(run(vanillaCheckCmd("src/components")!)).not.toBe(0);
  });

  it("prunes every directory the shared generated list names", () => {
    const cmd = vanillaCheckCmd("src")!;
    for (const d of GENERATED_DIRS) expect(cmd).toContain(`-name '${d}'`);
  });

  it("scopes to the configured component dir, not the repo root", () => {
    const r = resolveTypecheck("vanilla", { componentDir: "app/ui" });
    // Quoted and `./`-prefixed: the quoting is the safety property, so assert on it.
    expect(r.kind === "cmd" && r.cmd).toContain("find './app/ui'");
    expect(r.kind === "cmd" && r.cmd).not.toContain("find '.'");
  });

  it("falls back to src when no component dir is configured", () => {
    const r = resolveTypecheck("vanilla");
    expect(r.kind === "cmd" && r.cmd).toContain("find './src'");
  });
});

describe("typecheckScope is explicit, not inferred", () => {
  it("declares a scope for every framework", () => {
    for (const f of FRAMEWORKS) {
      expect(["project", "component-dir"]).toContain(FRAMEWORK_PROFILES[f].typecheckScope);
    }
  });

  it("only source-scopes the framework whose check is a file sweep", () => {
    // Keyed off the scope, not off supportLevel — otherwise a future experimental framework
    // with its own real checker would silently inherit vanilla's `find … node --check`.
    expect(FRAMEWORK_PROFILES.vanilla.typecheckScope).toBe("component-dir");
    for (const f of FRAMEWORKS.filter((x) => x !== "vanilla")) {
      expect(FRAMEWORK_PROFILES[f].typecheckScope, f).toBe("project");
    }
  });
});

/**
 * `component_dir` comes from `project.yaml` — which an agent writes — and ends up inside a
 * shell command the verify run executes. These tests EXECUTE the command and assert on real
 * side effects, because the only convincing proof that injection is impossible is that the
 * payload did not run.
 */
describe("vanillaCheckCmd — the shell boundary holds", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-shell-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const run = (cmd: string): number => spawnSync("sh", ["-c", cmd], { cwd: dir }).status ?? -1;
  const exists = async (rel: string): Promise<boolean> =>
    await stat(join(dir, rel)).then(() => true).catch(() => false);

  it("does NOT execute a command-substitution payload smuggled through component_dir", async () => {
    // The exact shape that created a marker file before quoting was added.
    const cmd = vanillaCheckCmd("src; touch INJECTED");
    // Validation may reject it outright; if a command IS produced it must be inert.
    if (cmd) run(cmd);
    expect(await exists("INJECTED"), "component_dir executed as shell code").toBe(false);
  });

  it.each([
    ["backtick substitution", "src`touch BACKTICK`"],
    ["dollar substitution", "src$(touch DOLLAR)"],
    ["redirect", "src > REDIRECT"],
    ["pipe to a writer", "src | tee PIPED"],
    ["quote break-out", "src' ; touch QUOTED ; '"],
  ])("neutralizes %s", async (_label, payload) => {
    const cmd = vanillaCheckCmd(payload);
    if (cmd) run(cmd);
    for (const marker of ["BACKTICK", "DOLLAR", "REDIRECT", "PIPED", "QUOTED"]) {
      expect(await exists(marker), `${marker} created by ${payload}`).toBe(false);
    }
  });

  it("still checks source in a directory whose name contains spaces and a quote", async () => {
    const odd = "my components' dir";
    await mkdir(join(dir, "src", odd), { recursive: true });
    await writeFile(join(dir, "src", odd, "ok.js"), "export const ok = 1;\n", "utf8");
    const cmd = vanillaCheckCmd(`src/${odd}`);
    expect(cmd).not.toBeNull();
    expect(run(cmd!)).toBe(0);

    await writeFile(join(dir, "src", odd, "bad.js"), "if (true) {\n", "utf8");
    expect(run(cmd!)).not.toBe(0); // and it can still FAIL — quoting did not defang the gate
  });

  it("treats a leading-dash directory as a path, not a find option", async () => {
    await mkdir(join(dir, "-dashdir"), { recursive: true });
    await writeFile(join(dir, "-dashdir", "ok.js"), "export const ok = 1;\n", "utf8");
    const cmd = vanillaCheckCmd("-dashdir");
    expect(cmd).not.toBeNull();
    expect(run(cmd!)).toBe(0);
  });

  it.each([
    ["absolute posix", "/etc"],
    ["absolute windows", "C:\\Windows"],
    ["traversal", "../../outside"],
    ["traversal mid-path", "src/../../etc"],
    ["empty", ""],
    ["dot only", "."],
    ["newline", "src\ncomponents"],
  ])("refuses %s rather than building a command", (_label, bad) => {
    expect(sanitizeComponentDir(bad), bad).toBeNull();
    expect(vanillaCheckCmd(bad), bad).toBeNull();
  });

  it("blocks the CODE layer when component_dir is unusable, instead of checking nothing", () => {
    const r = resolveTypecheck("vanilla", { componentDir: "../../escape" });
    expect(r.kind).toBe("invalid-config");
    expect(r.kind === "invalid-config" && r.reason).toMatch(/not a usable project-relative path/);
  });

  it("normalizes a redundant but legitimate path", () => {
    expect(sanitizeComponentDir("./src//components/")).toBe("src/components");
  });
});

/**
 * The batching trap, kept as a regression because I shipped it: `node --check` reads only its
 * FIRST argument, so `-exec node --check {} +` checked one file per batch and silently
 * skipped the rest. `-exec … \;` is no better — `find` discards the child's exit status, so
 * it always reports success. Both are gates that pass without checking.
 */
describe("vanillaCheckCmd — the gate actually checks every file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-batch-"));
    await mkdir(join(dir, "src"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const run = (cmd: string): number => spawnSync("sh", ["-c", cmd], { cwd: dir }).status ?? -1;

  it("fails when the broken file is not the first one found", async () => {
    // `a.js` sorts first and is valid; a batching gate reports success and never reads b.js.
    await writeFile(join(dir, "src", "a.js"), "export const ok = 1;\n", "utf8");
    await writeFile(join(dir, "src", "b.js"), "if (true) {\n", "utf8");
    expect(run(vanillaCheckCmd("src")!)).not.toBe(0);
  });

  it("passes when every file in a multi-file directory is valid", async () => {
    for (const n of ["a", "b", "c"]) {
      await writeFile(join(dir, "src", `${n}.js`), "export const ok = 1;\n", "utf8");
    }
    expect(run(vanillaCheckCmd("src")!)).toBe(0);
  });

  it("passes when there is no JS at all rather than erroring on empty input", async () => {
    await writeFile(join(dir, "src", "button.html"), "<button></button>\n", "utf8");
    expect(run(vanillaCheckCmd("src")!)).toBe(0);
  });
});

/**
 * Discovery failure must not read as success. The previous `find … | xargs …` form returned
 * only the pipeline's LAST status, so a `find` that failed outright fed `xargs` nothing and
 * reported a pass having checked zero files. Distinct from the legitimate empty case: no JS
 * to check is a pass; being unable to look is not.
 */
describe("vanillaCheckCmd — a check that could not run is not a pass", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-discovery-"));
  });
  afterEach(async () => {
    // Restore any permissions removed by a test so cleanup can recurse.
    await chmod(join(dir, "src", "locked"), 0o755).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  });
  const run = (cmd: string): number => spawnSync("sh", ["-c", cmd], { cwd: dir }).status ?? -1;

  it("FAILS when the component directory does not exist", async () => {
    expect(run(vanillaCheckCmd("missing-components")!)).not.toBe(0);
  });

  it("FAILS when a subdirectory cannot be read", async () => {
    await mkdir(join(dir, "src", "locked"), { recursive: true });
    await writeFile(join(dir, "src", "ok.js"), "export const ok = 1;\n", "utf8");
    await chmod(join(dir, "src", "locked"), 0o000);
    expect(run(vanillaCheckCmd("src")!)).not.toBe(0);
  });

  it("PASSES for a real directory that simply holds no JS", async () => {
    // The legitimate empty case must stay green, or the gate is just noise.
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "button.html"), "<button></button>\n", "utf8");
    expect(run(vanillaCheckCmd("src")!)).toBe(0);
  });
});
