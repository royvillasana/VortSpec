import { describe, it, expect } from "vitest";
import { frameworkSchema } from "./setup";
import {
  ALL_SOURCE_EXTS,
  FRAMEWORK_PROFILES,
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
  it("reports vanilla as having NO check rather than inventing one", () => {
    expect(resolveTypecheck("vanilla")).toEqual({ kind: "none", framework: "vanilla" });
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

describe("the table is immutable and exhaustive", () => {
  it("is frozen, so one consumer cannot mutate another's profile", () => {
    expect(Object.isFrozen(FRAMEWORK_PROFILES)).toBe(true);
    for (const f of FRAMEWORKS) expect(Object.isFrozen(FRAMEWORK_PROFILES[f])).toBe(true);
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
