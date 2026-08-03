import { describe, it, expect } from "vitest";
import { frameworkSchema } from "./setup";
import {
  ALL_SOURCE_EXTS,
  FRAMEWORK_PROFILES,
  profileFor,
  frameworkIdiomClause,
  idiomsFor,
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

describe("idioms — the authoring half of the profile", () => {
  it("gives every offered framework a complete idiom set", () => {
    // A blank field would silently drop a line from the prompt, which is how the React
    // default crept back in the first place.
    for (const f of FRAMEWORKS) {
      const i = FRAMEWORK_PROFILES[f].idioms;
      for (const key of ["label", "fileConvention", "props", "events", "slots", "variants", "styleScoping", "exports", "refs"] as const) {
        expect(i[key], `${f}.idioms.${key} is empty`).toBeTruthy();
      }
    }
  });

  it("does not prescribe CVA or forwardRef outside React", () => {
    // `component-standards.md` mandated both for all nine. `forwardRef` does not exist in
    // Vue/Svelte/Angular/Astro/vanilla, and in Angular `CVA` is `ControlValueAccessor`.
    for (const f of FRAMEWORKS.filter((x) => x !== "react" && x !== "next")) {
      const { variants, refs } = FRAMEWORK_PROFILES[f].idioms;
      // Naming CVA is fine — several rows name it precisely to warn it off. What must never
      // happen is PRESCRIBING it, so any mention has to sit next to a prohibition.
      if (/class-variance-authority|\bCVA\b/.test(variants)) {
        expect(variants, `${f} mentions CVA without warning against it`).toMatch(/Do NOT/);
      }
      expect(refs, `${f} still implies React ref forwarding`).toMatch(
        /no `forwardRef`|not applicable|querySelector|NOT React's ref forwarding/,
      );
    }
  });

  it("warns Svelte off external variant modules, which the compiler strips as unused CSS", () => {
    const v = FRAMEWORK_PROFILES.svelte.idioms.variants;
    expect(v).toMatch(/external module/);
    expect(v).toMatch(/unused CSS/);
  });

  it("tells Angular its event binding is (click), not Vue's @click", () => {
    expect(FRAMEWORK_PROFILES.angular.idioms.events).toContain("(click)");
    expect(FRAMEWORK_PROFILES.angular.idioms.pitfalls.join(" ")).toMatch(/ControlValueAccessor/);
  });

  it("does not claim a named export where the framework cannot have one", () => {
    // `.vue`, `.svelte` and `.astro` compile to default exports; the old blanket
    // "never a default export" rule was unsatisfiable for them.
    for (const f of ["vue", "nuxt", "svelte", "sveltekit", "astro"]) {
      expect(FRAMEWORK_PROFILES[f].idioms.exports).toMatch(/DEFAULT|export nothing/);
    }
  });
});

describe("idiomsFor / frameworkIdiomClause — fail closed, never fall back to React", () => {
  it("returns the framework's own idioms", () => {
    expect(idiomsFor("svelte")?.label).toBe("Svelte");
    expect(idiomsFor("ANGULAR")?.label).toBe("Angular");
  });

  it("returns null for an unset or unknown framework instead of React's", () => {
    // `profileFor` deliberately falls back to React for DETECTION (over-inclusive is safe).
    // Idioms must not: asserting React's conventions about an unknown framework is the exact
    // leak this table exists to stop.
    expect(idiomsFor(undefined)).toBeNull();
    expect(idiomsFor(null)).toBeNull();
    expect(idiomsFor("")).toBeNull();
    expect(idiomsFor("brand-new-framework")).toBeNull();
  });

  it("emits an explicit STOP for an unknown framework, not silence", () => {
    // Silence was fail-OPEN: with no clause the build proceeds and the model falls back to
    // its own habit, which is React — the original bug. An unknown framework must block.
    for (const f of ["brand-new-framework", undefined, null, ""] as const) {
      const clause = frameworkIdiomClause(f);
      expect(clause).toContain("STOP");
      expect(clause).toMatch(/Do NOT generate any component/);
      expect(clause).toMatch(/do NOT default to\s+React/);
      expect(clause).toContain("/setup");
    }
  });

  it("states that the contract overrides the toolkit's React-only standards", () => {
    // component-standards.md still mandates CVA/cn()/forwardRef for all nine and
    // /generate-artifacts loads it; without a precedence rule the agent gets two
    // contradictory instructions and picks one at random.
    const clause = frameworkIdiomClause("svelte");
    expect(clause).toContain("OVERRIDES");
    expect(clause).toContain("component-standards.md");
  });

  it("requires compiler-visible variant forms in Svelte, not just a local string", () => {
    // A dynamically built class string is not guaranteed to be seen by the compiler even
    // when it is built inside the component; the directive/attribute forms are.
    const v = FRAMEWORK_PROFILES.svelte.idioms.variants;
    expect(v).toContain("class:");
    expect(v).toContain("data-variant");
  });

  it("does not claim Astro lacks a runtime for frontmatter code", () => {
    // Astro frontmatter runs at BUILD time, so cva/clsx there ship no client JS. The old
    // wording gave a wrong reason for a defensible preference.
    const v = FRAMEWORK_PROFILES.astro.idioms.variants;
    expect(v).toContain("BUILD time");
    expect(FRAMEWORK_PROFILES.astro.idioms.pitfalls.join(" ")).not.toMatch(/no client runtime/);
  });

  it("names the framework and its conventions when it is known", () => {
    const clause = frameworkIdiomClause("vue");
    expect(clause).toContain("Vue 3");
    expect(clause).toContain("defineProps");
    expect(clause).toContain("<style scoped>");
    expect(clause).not.toContain("class-variance-authority");
  });
});
