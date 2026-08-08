import { describe, expect, it } from "vitest";
import { componentPaths, kebab, scaffoldFiles, stylingSurface, type ScaffoldInput } from "./scaffold";

const base: ScaffoldInput = {
  name: "Callout",
  framework: "react",
  language: "typescript",
  styling: "tailwind",
  componentDir: "src/components",
};

const at = (over: Partial<ScaffoldInput> = {}) => scaffoldFiles({ ...base, ...over });
const paths = (over: Partial<ScaffoldInput> = {}) => at(over).map((f) => f.path);
const roles = (over: Partial<ScaffoldInput> = {}) => at(over).map((f) => f.role);

describe("the file set follows framework-config.md (task 6.1)", () => {
  it("React: component, variants, test, metadata", () => {
    expect(paths()).toEqual([
      "src/components/Callout.tsx",
      "src/components/Callout.variants.ts",
      "src/components/Callout.test.tsx",
      ".vortspec/metadata/callout.json",
    ]);
  });

  it("Vue: a single-file component, no separate variants or stylesheet", () => {
    expect(paths({ framework: "vue", styling: "css" })).toEqual([
      "src/components/Callout.vue",
      "src/components/Callout.test.ts",
      ".vortspec/metadata/callout.json",
    ]);
  });

  it("Svelte: an SFC", () => {
    expect(paths({ framework: "svelte", styling: "css" })).toContain("src/components/Callout.svelte");
  });

  it("Angular: a DIRECTORY with the .component infix and a template", () => {
    expect(paths({ framework: "angular", styling: "scss" })).toEqual([
      "src/components/callout/callout.component.ts",
      "src/components/callout/callout.component.html",
      "src/components/callout/callout.component.scss",
      "src/components/callout/callout.component.spec.ts",
      ".vortspec/metadata/callout.json",
    ]);
  });

  it("Astro: an .astro component with its styles inside", () => {
    const files = paths({ framework: "astro", styling: "css" });
    expect(files).toContain("src/components/Callout.astro");
    expect(files.some((p) => p.endsWith(".css"))).toBe(false);
  });

  it("JavaScript projects get .jsx/.js, not .tsx/.ts", () => {
    const files = paths({ language: "javascript" });
    expect(files).toContain("src/components/Callout.jsx");
    expect(files).toContain("src/components/Callout.variants.js");
    expect(files.some((p) => p.endsWith(".ts") || p.endsWith(".tsx"))).toBe(false);
  });

  it("honours the project's component directory", () => {
    expect(componentPaths({ ...base, componentDir: "app/ui/" }).dir).toBe("app/ui");
  });
});

describe("inapplicable files are OMITTED, never emitted empty (task 6.3)", () => {
  it("writes no stylesheet for Tailwind or CSS-in-JS", () => {
    for (const styling of ["tailwind", "styled-components", "emotion"] as const)
      expect(roles({ styling })).not.toContain("styles");
  });

  it("writes a stylesheet for CSS, SCSS and CSS modules", () => {
    expect(paths({ styling: "css" })).toContain("src/components/Callout.css");
    expect(paths({ styling: "scss" })).toContain("src/components/Callout.scss");
    expect(paths({ styling: "css-modules" })).toContain("src/components/Callout.module.css");
  });

  it("writes a separate variants file ONLY where the framework separates them", () => {
    // `component-standards.md` mandates CVA in a colocated `.variants.ts`, and that is a JSX
    // convention. A Vue SFC's variants are class bindings in the file it already has.
    expect(roles({ framework: "react" })).toContain("variants");
    for (const framework of ["vue", "svelte", "astro", "angular", "vanilla"] as const)
      expect(roles({ framework, styling: "css" })).not.toContain("variants");
  });

  it("writes a barrel only when the project uses one", () => {
    expect(roles()).not.toContain("barrel");
    expect(paths({ hasBarrel: true })).toContain("src/components/index.ts");
  });

  it("NEVER produces a zero-content file", () => {
    // An empty `Button.variants.ts` is worse than no file: it looks like a convention, the next
    // component copies it, and the emptiness spreads.
    for (const framework of ["react", "next", "vue", "nuxt", "svelte", "sveltekit", "angular", "astro", "vanilla"] as const)
      for (const styling of ["css", "css-modules", "scss", "tailwind", "styled-components", "emotion"] as const)
        for (const file of at({ framework, styling, hasBarrel: true }))
          expect(file.contents.trim(), `${framework}/${styling} → ${file.path}`).not.toBe("");
  });
});

describe("the smoke test is real (task 6.4)", () => {
  it("asserts something executable, never a todo or a snapshot", () => {
    // A placeholder passes on a component that throws on mount, which makes the suite's green a
    // claim it is not entitled to make.
    for (const framework of ["react", "vue", "svelte", "angular", "astro", "vanilla"] as const) {
      const test = at({ framework, styling: "css" }).find((f) => f.role === "test");
      expect(test, framework).toBeDefined();
      expect(test!.contents, framework).toContain("expect(");
      expect(test!.contents, framework).not.toContain("it.todo");
      expect(test!.contents, framework).not.toContain("toMatchSnapshot");
    }
  });

  it("renders the component under test, not a stand-in", () => {
    const test = at({ framework: "react" }).find((f) => f.role === "test");
    expect(test!.contents).toContain("render(<Callout>hello</Callout>)");
  });
});

describe("the metadata record (task 6.5)", () => {
  const record = (over: Partial<ScaffoldInput> = {}) =>
    JSON.parse(at(over).find((f) => f.role === "metadata")!.contents);

  it("populates identity, which is knowable now", () => {
    const meta = record({ tier: "molecule" });
    expect(meta.identity.name).toBe("Callout");
    expect(meta.identity.category).toBe("molecule");
    expect(meta.identity.importPath).toBe("src/components/Callout");
  });

  it("leaves the analysis sections EMPTY and marks the record incomplete", () => {
    // Plausible placeholder criteria would make metadata coverage report a project as ready on the
    // strength of sentences nobody wrote.
    const meta = record();
    expect(meta.aiHints.selectionCriteria).toEqual([]);
    expect(meta.usage.antiPatterns).toEqual([]);
    expect(meta.origin).toBe("migrated");
  });

  it("records the styling surface at scaffold time (task 6.7)", () => {
    expect(record({ styling: "tailwind" }).vortspec.stylingSurface).toBe("utility-classes");
    expect(record({ styling: "css" }).vortspec.stylingSurface).toBe("declarations");
  });
});

describe("determinism (task 6.6)", () => {
  it("produces the same file set at the same paths every time", () => {
    for (const framework of ["react", "vue", "svelte", "angular", "astro", "vanilla"] as const) {
      const once = at({ framework, styling: "css", hasBarrel: true });
      const twice = at({ framework, styling: "css", hasBarrel: true });
      expect(twice).toEqual(once);
    }
  });

  it("gives every file a distinct path", () => {
    for (const framework of ["react", "vue", "angular", "vanilla"] as const) {
      const list = paths({ framework, styling: "scss", hasBarrel: true });
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("stylingSurface", () => {
  it("marks Tailwind as utility classes and everything else as declarations", () => {
    expect(stylingSurface("tailwind")).toBe("utility-classes");
    for (const styling of ["css", "css-modules", "scss", "styled-components", "emotion"] as const)
      expect(stylingSurface(styling)).toBe("declarations");
  });
});

describe("kebab", () => {
  it("converts a component name to Angular's file convention", () => {
    expect(kebab("Callout")).toBe("callout");
    expect(kebab("SearchBar")).toBe("search-bar");
    expect(kebab("HTTPClient")).toBe("http-client");
  });
});
