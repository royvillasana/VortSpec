import { describe, it, expect } from "vitest";
import { frameworkSchema } from "./setup";
import {
  ALL_SOURCE_EXTS,
  FRAMEWORK_PROFILES,
  profileFor,
  stripFileSuffix,
  typecheckCmdFor,
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

describe("typecheckCmdFor", () => {
  // The regression this whole change exists for: `tsc` cannot parse these at all, so the
  // CODE layer used to pass without reading a single line of the component.
  it.each([
    ["vue", "vue-tsc"],
    ["nuxt", "vue-tsc"],
    ["svelte", "svelte-check"],
    ["sveltekit", "svelte-check"],
    ["astro", "astro check"],
  ])("gives %s a checker that can actually parse its files (%s)", (framework, expected) => {
    const cmd = typecheckCmdFor(framework);
    expect(cmd).toContain(expected);
    // Anchored on the BARE invocation: `npx vue-tsc` legitimately contains "tsc --noEmit".
    expect(cmd).not.toContain("npx tsc");
  });

  it("checks Angular with a build, because tsc never reads the template", () => {
    expect(typecheckCmdFor("angular")).toContain("ng build");
  });

  it("keeps plain tsc for the frameworks whose components really are .ts/.tsx", () => {
    expect(typecheckCmdFor("react")).toBe("npx tsc --noEmit");
    expect(typecheckCmdFor("next")).toBe("npx tsc --noEmit");
  });

  it("returns null rather than a lying command when there is no check", () => {
    expect(typecheckCmdFor("vanilla")).toBeNull();
  });

  it("falls back to React for an unset or unknown framework", () => {
    expect(typecheckCmdFor(undefined)).toBe("npx tsc --noEmit");
    expect(typecheckCmdFor("brand-new-framework")).toBe("npx tsc --noEmit");
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
    expect(profileFor("astro").sourceExts).toContain(".astro");
    expect(profileFor("vanilla").sourceExts).toContain(".html");
  });
});
