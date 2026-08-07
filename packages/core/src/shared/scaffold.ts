/**
 * The deterministic component scaffold — OpenSpec change: agentic-design-system, group 6.
 *
 * PURE — decides the file set and renders its contents. `main/inspector/scaffold.ts` writes.
 *
 * **This codifies `.sdd-de/docs/framework-config.md` and `component-standards.md`; it invents no new
 * standard.** Every path and every convention below is taken from those documents, which is the point
 * of task 6.1: the scaffold's value is that the file set stops being a per-run judgement call, not
 * that it introduces a different layout.
 *
 * The problem it solves is narrow and specific. Today a model decides which files a component
 * consists of, and it decides slightly differently every time — a `.variants.ts` here, a test there,
 * a barrel export when it remembers. Those differences are indistinguishable from generation-quality
 * problems and get debugged as if they were. With the file set fixed, the model supplies CONTENT into
 * files that already exist, and a missing file is a scaffold failure with a name.
 */

export type Framework =
  | "react"
  | "next"
  | "vue"
  | "nuxt"
  | "svelte"
  | "sveltekit"
  | "angular"
  | "astro"
  | "vanilla";

export type Styling =
  | "css"
  | "css-modules"
  | "scss"
  | "tailwind"
  | "styled-components"
  | "emotion";

export interface ScaffoldInput {
  name: string;
  framework: Framework;
  language: "typescript" | "javascript";
  styling: Styling;
  /** Project-relative component root, from `.sdd-de/project.yaml`. */
  componentDir: string;
  /** Atomic tier, used for the metadata record's `identity.category`. */
  tier?: "atom" | "molecule" | "organism" | "template";
  /** Whether the project keeps a barrel (`index.ts`) — a barrel is written only if one is used. */
  hasBarrel?: boolean;
}

export interface ScaffoldFile {
  /** Project-relative path. */
  path: string;
  contents: string;
  /** What this file is for — surfaced when a scaffold reports what it wrote. */
  role: "implementation" | "variants" | "styles" | "test" | "barrel" | "metadata" | "template";
}

/**
 * How much of a component's styling a governance rule can actually see (task 6.7).
 *
 *  • `declarations`    — property/value pairs are in the source: CSS, SCSS, CSS modules, SFC
 *                        `<style>` blocks, and the template literals of styled-components/emotion.
 *                        Every rule is evaluable.
 *  • `utility-classes` — Tailwind. An ARBITRARY value (`bg-[var(--x)]`) is readable, but a
 *                        theme-mapped utility (`bg-primary`) names a scale key, not a token on a
 *                        property, so a hierarchy or typography rule has nothing to read. Coverage
 *                        is reduced rather than reported as passing.
 */
export type StylingSurface = "declarations" | "utility-classes";

export function stylingSurface(styling: Styling): StylingSurface {
  return styling === "tailwind" ? "utility-classes" : "declarations";
}

const EXT = { typescript: "ts", javascript: "js" } as const;
const JSX_EXT = { typescript: "tsx", javascript: "jsx" } as const;

/** Frameworks whose components are JSX modules — the only ones with a separate variants file. */
const JSX_FRAMEWORKS = new Set<Framework>(["react", "next"]);

/** Frameworks whose styles live INSIDE the component file, so a separate style file is wrong. */
const SINGLE_FILE_FRAMEWORKS = new Set<Framework>(["vue", "nuxt", "svelte", "sveltekit", "astro"]);

/**
 * kebab-case, for Angular's file and selector conventions.
 *
 * Re-exported from `relationship-graph.ts` rather than reimplemented: the graph already kebabs
 * component names to match Angular selectors, and two implementations would eventually disagree on
 * an acronym — at which point the scaffold would write a file the graph could not match back to its
 * component.
 */
import { kebabCase as kebab } from "./relationship-graph";
export { kebabCase as kebab } from "./relationship-graph";

/**
 * Where a component's files live, per `framework-config.md`.
 *
 * Angular is the one that is a DIRECTORY rather than a file stem, and its files carry a
 * `.component` infix — the same convention `framework-profiles.ts` already strips when matching a
 * roster entry to a file on disk.
 */
export function componentPaths(input: ScaffoldInput): { dir: string; stem: string } {
  const root = input.componentDir.replace(/\/+$/, "");
  if (input.framework === "angular") {
    const slug = kebab(input.name);
    return { dir: `${root}/${slug}`, stem: `${slug}.component` };
  }
  return { dir: root, stem: input.name };
}

/**
 * The file set for one component.
 *
 * **Inapplicable files are OMITTED, never emitted empty (task 6.3).** A zero-content
 * `Button.variants.ts` in a Vue project is worse than no file: it looks like a convention the
 * project follows, the next component copies it, and the emptiness spreads. Every entry returned
 * here carries real content, and a test asserts no file is ever written blank.
 */
export function scaffoldFiles(input: ScaffoldInput): ScaffoldFile[] {
  const { dir, stem } = componentPaths(input);
  const files: ScaffoldFile[] = [];
  const code = EXT[input.language];
  const jsx = JSX_EXT[input.language];
  const separatesVariants = JSX_FRAMEWORKS.has(input.framework);

  switch (input.framework) {
    case "react":
    case "next":
      files.push({ path: `${dir}/${stem}.${jsx}`, contents: jsxComponent(input), role: "implementation" });
      break;
    case "vue":
    case "nuxt":
      files.push({ path: `${dir}/${stem}.vue`, contents: vueComponent(input), role: "implementation" });
      break;
    case "svelte":
    case "sveltekit":
      files.push({ path: `${dir}/${stem}.svelte`, contents: svelteComponent(input), role: "implementation" });
      break;
    case "astro":
      files.push({ path: `${dir}/${stem}.astro`, contents: astroComponent(input), role: "implementation" });
      break;
    case "angular":
      files.push({ path: `${dir}/${stem}.${code}`, contents: angularComponent(input), role: "implementation" });
      files.push({ path: `${dir}/${kebab(input.name)}.component.html`, contents: angularTemplate(input), role: "template" });
      break;
    case "vanilla":
      files.push({ path: `${dir}/${kebab(input.name)}.html`, contents: vanillaMarkup(input), role: "implementation" });
      break;
  }

  // Variants live in their own file ONLY where the framework separates them — `component-standards.md`
  // mandates CVA in a colocated `.variants.ts`, and that convention is a JSX one. A Vue SFC's variants
  // are class bindings inside the file it already has.
  if (separatesVariants && input.styling !== "styled-components" && input.styling !== "emotion")
    files.push({ path: `${dir}/${stem}.variants.${code}`, contents: variantsFile(input), role: "variants" });

  const styleFile = stylePath(input, dir, stem);
  if (styleFile) files.push({ path: styleFile, contents: styleContents(input), role: "styles" });

  files.push({ path: testPath(input, dir, stem), contents: smokeTest(input), role: "test" });

  if (input.hasBarrel && !SINGLE_FILE_FRAMEWORKS.has(input.framework) && input.framework !== "vanilla")
    files.push({ path: `${dir}/index.${code}`, contents: barrel(input, stem), role: "barrel" });

  files.push({
    path: `.vortspec/metadata/${input.name.toLowerCase()}.json`,
    contents: metadataRecord(input),
    role: "metadata",
  });

  return files;
}

/**
 * The stylesheet, or null when the framework or styling approach has none.
 *
 * Tailwind and the CSS-in-JS approaches genuinely produce no stylesheet, and the single-file
 * frameworks put theirs inside the component. Returning null is what keeps 6.3 honest.
 */
function stylePath(input: ScaffoldInput, dir: string, stem: string): string | null {
  if (input.styling === "tailwind" || input.styling === "styled-components" || input.styling === "emotion")
    return null;
  if (SINGLE_FILE_FRAMEWORKS.has(input.framework)) return null;
  if (input.framework === "angular") return `${dir}/${kebab(input.name)}.component.scss`;
  if (input.styling === "css-modules") return `${dir}/${stem}.module.css`;
  return `${dir}/${input.framework === "vanilla" ? kebab(input.name) : stem}.${input.styling === "scss" ? "scss" : "css"}`;
}

function testPath(input: ScaffoldInput, dir: string, stem: string): string {
  const code = EXT[input.language];
  if (input.framework === "angular") return `${dir}/${kebab(input.name)}.component.spec.${code}`;
  if (input.framework === "vanilla") return `${dir}/${kebab(input.name)}.test.${code}`;
  const ext = JSX_FRAMEWORKS.has(input.framework) ? JSX_EXT[input.language] : code;
  return `${dir}/${stem}.test.${ext}`;
}

// ── contents ────────────────────────────────────────────────────────────

/** The class expression for the root element, per styling approach. */
function rootClass(input: ScaffoldInput): string {
  const slug = kebab(input.name);
  if (input.styling === "tailwind") return `bg-[var(--color-surface)] text-[var(--color-fg-default)]`;
  if (input.styling === "css-modules") return `styles.root`;
  return `${slug}`;
}

function jsxComponent(input: ScaffoldInput): string {
  const { name } = input;
  const ts = input.language === "typescript";
  const usesVariants = input.styling !== "styled-components" && input.styling !== "emotion";
  const imports = [
    `import { forwardRef } from "react";`,
    input.styling === "css-modules" ? `import styles from "./${name}.module.css";` : null,
    input.styling === "css" || input.styling === "scss"
      ? `import "./${name}.${input.styling === "scss" ? "scss" : "css"}";`
      : null,
    usesVariants ? `import { ${name.toLowerCase()}Variants } from "./${name}.variants";` : null,
  ].filter(Boolean);

  const props = ts
    ? `export interface ${name}Props extends React.HTMLAttributes<HTMLDivElement> {\n  /** TODO: describe each prop — this record is read by generators. */\n  variant?: "default";\n}\n\n`
    : "";

  const className =
    input.styling === "css-modules"
      ? `\${styles.root} \${className ?? ""}`
      : usesVariants
        ? `\${${name.toLowerCase()}Variants({ variant })} \${className ?? ""}`
        : `${rootClass(input)} \${className ?? ""}`;

  return `${imports.join("\n")}

${props}/**
 * ${name} — scaffolded by VortSpec. Fill in the implementation; do not change the file set.
 */
export const ${name} = forwardRef<HTMLDivElement, ${ts ? `${name}Props` : "any"}>(
  ({ variant = "default", className, children, ...rest }, ref) => (
    <div ref={ref} className={\`${className}\`} {...rest}>
      {children}
    </div>
  ),
);
${name}.displayName = "${name}";
`;
}

function variantsFile(input: ScaffoldInput): string {
  const slug = input.name.toLowerCase();
  return `import { cva${input.language === "typescript" ? ", type VariantProps" : ""} } from "class-variance-authority";

/**
 * ${input.name}'s variants. Every value here must reference a design token — a literal colour or
 * spacing value fails review (see .sdd-de/docs/component-standards.md).
 */
export const ${slug}Variants = cva("", {
  variants: {
    variant: {
      default: "${input.styling === "tailwind" ? "bg-[var(--color-surface)] text-[var(--color-fg-default)]" : `${kebab(input.name)}--default`}",
    },
  },
  defaultVariants: { variant: "default" },
});
${input.language === "typescript" ? `\nexport type ${input.name}Variants = VariantProps<typeof ${slug}Variants>;\n` : ""}`;
}

function vueComponent(input: ScaffoldInput): string {
  return `<script setup${input.language === "typescript" ? ' lang="ts"' : ""}>
${input.language === "typescript" ? `interface Props {\n  variant?: "default";\n}\nwithDefaults(defineProps<Props>(), { variant: "default" });` : `defineProps({ variant: { type: String, default: "default" } });`}
</script>

<template>
  <div :class="\`${kebab(input.name)} ${kebab(input.name)}--\${variant}\`">
    <slot />
  </div>
</template>

<style scoped>
.${kebab(input.name)} {
  background: var(--color-surface);
  color: var(--color-fg-default);
}
</style>
`;
}

function svelteComponent(input: ScaffoldInput): string {
  return `<script${input.language === "typescript" ? ' lang="ts"' : ""}>
  export let variant${input.language === "typescript" ? ': "default"' : ""} = "default";
</script>

<div class="${kebab(input.name)} ${kebab(input.name)}--{variant}">
  <slot />
</div>

<style>
  .${kebab(input.name)} {
    background: var(--color-surface);
    color: var(--color-fg-default);
  }
</style>
`;
}

function astroComponent(input: ScaffoldInput): string {
  return `---
${input.language === "typescript" ? `interface Props {\n  variant?: "default";\n}\n` : ""}const { variant = "default" } = Astro.props;
---

<div class={\`${kebab(input.name)} ${kebab(input.name)}--\${variant}\`}>
  <slot />
</div>

<style>
  .${kebab(input.name)} {
    background: var(--color-surface);
    color: var(--color-fg-default);
  }
</style>
`;
}

function angularComponent(input: ScaffoldInput): string {
  const slug = kebab(input.name);
  return `import { Component, Input } from "@angular/core";

@Component({
  selector: "app-${slug}",
  templateUrl: "./${slug}.component.html",
  styleUrls: ["./${slug}.component.scss"],
})
export class ${input.name}Component {
  @Input() variant${input.language === "typescript" ? ': "default"' : ""} = "default";
}
`;
}

function angularTemplate(input: ScaffoldInput): string {
  const slug = kebab(input.name);
  return `<div [class]="'${slug} ${slug}--' + variant">
  <ng-content />
</div>
`;
}

function vanillaMarkup(input: ScaffoldInput): string {
  const slug = kebab(input.name);
  return `<!-- ${input.name} — scaffolded by VortSpec. -->
<div class="${slug} ${slug}--default"></div>
`;
}

function styleContents(input: ScaffoldInput): string {
  const slug = kebab(input.name);
  const selector = input.styling === "css-modules" ? ".root" : `.${slug}`;
  return `/* ${input.name} — every value must reference a design token. */
${selector} {
  background: var(--color-surface);
  color: var(--color-fg-default);
}
`;
}

/**
 * A REAL smoke test (task 6.4) — one executable assertion that the component renders.
 *
 * Not a `it.todo` and not a snapshot. A placeholder test passes on a component that throws on mount,
 * which makes the suite's green a claim it is not entitled to make.
 */
function smokeTest(input: ScaffoldInput): string {
  const { name } = input;
  switch (input.framework) {
    case "react":
    case "next":
      return `import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ${name} } from "./${name}";

describe("${name}", () => {
  it("renders its children", () => {
    const { getByText } = render(<${name}>hello</${name}>);
    expect(getByText("hello")).toBeTruthy();
  });
});
`;
    case "vue":
    case "nuxt":
      return `import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ${name} from "./${name}.vue";

describe("${name}", () => {
  it("renders its slot", () => {
    expect(mount(${name}, { slots: { default: "hello" } }).text()).toContain("hello");
  });
});
`;
    case "svelte":
    case "sveltekit":
      return `import { describe, expect, it } from "vitest";
import { render } from "@testing-library/svelte";
import ${name} from "./${name}.svelte";

describe("${name}", () => {
  it("mounts", () => {
    expect(render(${name}).container.querySelector(".${kebab(name)}")).toBeTruthy();
  });
});
`;
    case "angular":
      return `import { TestBed } from "@angular/core/testing";
import { ${name}Component } from "./${kebab(name)}.component";

describe("${name}Component", () => {
  it("creates", async () => {
    await TestBed.configureTestingModule({ declarations: [${name}Component] }).compileComponents();
    expect(TestBed.createComponent(${name}Component).componentInstance).toBeTruthy();
  });
});
`;
    default:
      // Astro and vanilla have no component test runner in the standards doc, so the smoke test
      // asserts the artifact exists and is non-empty — a real assertion, not a placeholder.
      return `import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("${name}", () => {
  it("has markup", () => {
    const file = join(__dirname, "${input.framework === "astro" ? `${name}.astro` : `${kebab(name)}.html`}");
    expect(readFileSync(file, "utf8").trim().length).toBeGreaterThan(0);
  });
});
`;
  }
}

function barrel(input: ScaffoldInput, stem: string): string {
  if (input.framework === "angular")
    return `export { ${input.name}Component } from "./${stem}";\n`;
  return `export { ${input.name} } from "./${stem}";\n`;
}

/**
 * The metadata record written at scaffold time (task 6.5).
 *
 * `identity` is fully populated because it is knowable NOW — the name, the tier, the import path.
 * Every analysis-derived section is left EMPTY and the record is marked `migrated`, which is the
 * origin value `isMetadataComplete` already reads as incomplete. That is the point: a scaffolded
 * component must count as "has a record, needs authoring", never as documented. Writing plausible
 * placeholder criteria would make the metadata-coverage signal report a project as ready on the
 * strength of sentences nobody wrote.
 */
function metadataRecord(input: ScaffoldInput): string {
  const { dir, stem } = componentPaths(input);
  return `${JSON.stringify(
    {
      name: input.name,
      identity: {
        name: input.name,
        category: input.tier ?? "atom",
        type: "display",
        description: "",
        importPath: `${dir}/${stem}`,
      },
      usage: { useCases: [], commonPatterns: [], antiPatterns: [] },
      variants: [],
      props: [],
      composition: { itemShape: [], slots: [], worksWith: [] },
      behavior: { states: [], interactions: [] },
      accessibility: { notes: [] },
      designTokens: { colors: [], typography: [], spacing: [], shadows: [], radius: [] },
      aiHints: { context: "", selectionCriteria: [], keywords: [], generationRules: [] },
      origin: "migrated",
      vortspec: {
        scaffolded: true,
        // Recorded at scaffold time (task 6.7) so the audit knows what it can and cannot evaluate.
        stylingSurface: stylingSurface(input.styling),
      },
    },
    null,
    2,
  )}\n`;
}
