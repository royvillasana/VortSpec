/**
 * Per-framework facts, as DATA rather than prose.
 *
 * VortSpec offers nine frameworks (`frameworkSchema` in `setup.ts`), but the facts that
 * distinguish them were until now hardcoded, separately, in every consumer that needed
 * them — and those copies disagreed. `component-reader.ts` looked for `.tsx/.jsx/.vue/
 * .svelte/.ts` while `scan-cache.ts` also accepted `.astro/.js`; `verifyPrompt` ran
 * `npx tsc --noEmit` for all nine even though `tsc` cannot parse `.vue`, `.svelte`, or
 * `.astro` at all. The result was a pipeline that reported success on frameworks it had
 * not checked.
 *
 * This table is the single place those facts live. It is deliberately narrow — it holds
 * only what the detection and verification consumers need today. Authoring idioms
 * (variant strategy, props/slot/ref conventions, styling) belong on the same record and
 * should be ADDED here rather than re-derived in a prompt string.
 */

/** What VortSpec needs to know about a framework to find and check its components. */
export interface FrameworkProfile {
  /**
   * Extensions a built component file can carry, most specific first. Used to decide
   * whether a component on the roster actually exists on disk.
   */
  sourceExts: string[];
  /**
   * The framework-native type/template check, or `null` when the framework has no
   * meaningful one (a no-build vanilla project). `npx tsc --noEmit` is correct ONLY for
   * the frameworks whose components are plain `.ts`/`.tsx`.
   */
  typecheckCmd: string | null;
  /**
   * Filename suffixes that sit between the component name and the extension, stripped
   * before matching a file to a roster entry. Angular's convention is
   * `button.component.ts`, whose stem would otherwise never equal `button`.
   */
  fileSuffixes: string[];
  /**
   * How code for this framework is actually WRITTEN. Detection and verification (above)
   * tell us where a component lives and how to check it; these tell the build prompt what
   * to emit, so it can state the real conventions instead of saying "the configured
   * framework" and letting the model fill the gap with React habits.
   */
  idioms: FrameworkIdioms;
}

/**
 * The authoring conventions the build prompt interpolates. Every field is prose because
 * its consumer is a prompt, but it lives here as data so the nine frameworks' rules can be
 * diffed, tested, and corrected in one place rather than restated across toolkit docs that
 * drift apart.
 */
export interface FrameworkIdioms {
  /** Human label, matching `FRAMEWORK_OPTIONS` in `setup.ts`. */
  label: string;
  /** Where a component file lives and how it is named. */
  fileConvention: string;
  /** How props/inputs are declared. */
  props: string;
  /** How events are emitted and bound. */
  events: string;
  /** How child content is projected. */
  slots: string;
  /**
   * How variants are expressed. Deliberately NOT "CVA everywhere" — that instruction is
   * React-specific, breaks Svelte's CSS analysis, and in Angular `CVA` names an unrelated
   * forms interface.
   */
  variants: string;
  /** How a component's styles are scoped. */
  styleScoping: string;
  /** Export convention. */
  exports: string;
  /** How a caller reaches the underlying element, if at all. */
  refs: string;
  /** Traps where the obvious cross-framework instruction is wrong or means something else. */
  pitfalls: string[];
}

const REACT_BASE = {
  props: "a TypeScript `interface`/`type` for props, destructured in the function signature",
  events: "handler props in camelCase (`onClick`, `onChange`), passed straight to the DOM element",
  slots: "the `children` prop",
  variants:
    "CVA (`class-variance-authority`) in a colocated `<name>.variants.ts`, merged with a `cn()` helper; " +
    "consumers pass `className` LAST so layout overrides win",
  styleScoping:
    "per the project's configured `styling` value — class names are global, so no compiler scoping applies",
  exports:
    "a NAMED export (`export const Button = …`), never a default export; mixing the two breaks the Storybook " +
    "build with MISSING_EXPORT",
  refs:
    "React 19+ passes `ref` as an ordinary prop; reach for `forwardRef` ONLY if the installed react version is 18 " +
    "or below — check `package.json`, do not assume",
} as const;

const VUE_BASE = {
  props: '`defineProps<Props>()` inside `<script setup lang="ts">`, with `withDefaults()` for optional props',
  events: "`defineEmits<{ … }>()`, bound in the template with `@click` / `@submit`",
  slots: '`<slot />` (named slots via `<slot name="…" />`)',
  variants:
    "a `computed()` returning the class binding, kept INSIDE the SFC. Do NOT put variant classes in an external " +
    "`.variants.ts` — that breaks the single-file-component model and puts them out of reach of `<style scoped>`",
  styleScoping:
    "`<style scoped>` in the SFC — Vue rewrites the selectors with a data attribute it applies to the rendered elements",
  exports:
    "an SFC compiles to a DEFAULT export and is imported as `import Button from './Button.vue'`; a named export of " +
    "the component itself is not possible, so do not attempt one",
  refs: "`defineExpose()` for a public instance API, `ref` on the element for internal access. There is no `forwardRef`",
} as const;

const SVELTE_BASE = {
  props:
    "Svelte 5 runes — `let { variant = 'primary', children } = $props()`. Use `export let` ONLY if the installed " +
    "svelte version is 4; check `package.json` first",
  events:
    "Svelte 5 uses plain attributes (`onclick={…}`). The `on:click` directive is Svelte 4 and is REMOVED in Svelte 5+ — " +
    "check the installed version",
  slots: "Svelte 5 snippets — `{@render children?.()}`. `<slot />` is the Svelte 4 form",
  variants:
    "express variants so the COMPILER can see them: `class:` directives (`class:btn--primary={variant === 'primary'}`) " +
    "or a `data-variant={variant}` attribute styled with an attribute selector (`[data-variant='primary'] { … }`). " +
    "Svelte decides which `<style>` rules to keep by statically analysing the markup, so a class name it cannot see " +
    "is stripped as unused CSS and the component renders unstyled. Building the class string in an external module " +
    "guarantees that; even a locally computed dynamic string is not guaranteed to be seen — the directive and " +
    "attribute forms are, which is why they are the requirement here and not merely the suggestion",
  styleScoping: "`<style>` in the component, auto-scoped by the compiler",
  exports: "a Svelte component is a DEFAULT export — `import Button from './Button.svelte'`",
  refs: "`bind:this={el}` for element access. There is no `forwardRef`",
} as const;

const REACT_LIKE = {
  sourceExts: [".tsx", ".jsx", ".ts", ".js"],
  typecheckCmd: "npx tsc --noEmit",
  fileSuffixes: [],
} satisfies Omit<FrameworkProfile, "idioms">;

const VUE_LIKE = {
  sourceExts: [".vue"],
  // `tsc` skips `.vue` entirely; `vue-tsc` is the compiler-aware wrapper.
  typecheckCmd: "npx vue-tsc --noEmit",
  fileSuffixes: [],
} satisfies Omit<FrameworkProfile, "idioms">;

const SVELTE_LIKE = {
  sourceExts: [".svelte"],
  // `svelte-check` is the only checker that reads `.svelte`; `--threshold error` keeps
  // the gate on real failures rather than a11y warnings.
  typecheckCmd: "npx svelte-check --threshold error",
  fileSuffixes: [],
} satisfies Omit<FrameworkProfile, "idioms">;

export const FRAMEWORK_PROFILES: Record<string, FrameworkProfile> = {
  react: {
    ...REACT_LIKE,
    idioms: {
      label: "React (Vite)",
      fileConvention: "`<component_dir>/<category>/<ComponentName>.tsx` (PascalCase file, kebab-case folder)",
      ...REACT_BASE,
      pitfalls: ["`forwardRef` is deprecated in React 19 — check the installed version before reaching for it."],
    },
  },
  next: {
    ...REACT_LIKE,
    idioms: {
      label: "Next.js (App Router)",
      fileConvention: "`<component_dir>/<category>/<component-name>.tsx`; pages are `app/<route>/page.tsx`",
      ...REACT_BASE,
      pitfalls: [
        "Server Components are the default — add `'use client'` ONLY when the component uses state, effects, event handlers, or browser APIs.",
        "`forwardRef` is deprecated in React 19 — check the installed version before reaching for it.",
      ],
    },
  },
  vue: {
    ...VUE_LIKE,
    idioms: {
      label: "Vue 3",
      fileConvention: "`<component_dir>/<category>/<ComponentName>.vue` (single-file component)",
      ...VUE_BASE,
      pitfalls: ["`tsc` cannot parse `.vue` — the check is `vue-tsc`, and a bare `tsc` pass proves nothing."],
    },
  },
  nuxt: {
    ...VUE_LIKE,
    idioms: {
      label: "Nuxt 3",
      fileConvention: "`components/<ComponentName>.vue` — Nuxt auto-imports these, so do NOT add manual imports",
      ...VUE_BASE,
      pitfalls: [
        "Components under `components/` are auto-imported; an explicit import is redundant and often wrong.",
        "`tsc` cannot parse `.vue` — the check is `vue-tsc`.",
      ],
    },
  },
  svelte: {
    ...SVELTE_LIKE,
    idioms: {
      label: "Svelte",
      fileConvention: "`<component_dir>/<ComponentName>.svelte`",
      ...SVELTE_BASE,
      pitfalls: [
        "`tsc` cannot parse `.svelte` — the check is `svelte-check`.",
        "Svelte 5 has been the default since Oct 2024; do not emit Svelte 4 idioms without checking the installed version.",
      ],
    },
  },
  sveltekit: {
    ...SVELTE_LIKE,
    idioms: {
      label: "SvelteKit",
      fileConvention: "`src/lib/components/<ComponentName>.svelte`; routes are `src/routes/<route>/+page.svelte`",
      ...SVELTE_BASE,
      pitfalls: [
        "`tsc` cannot parse `.svelte` — the check is `svelte-check`.",
        "Import components through the `$lib` alias, not deep relative paths.",
      ],
    },
  },
  angular: {
    sourceExts: [".ts"],
    // Angular class files are plain `.ts`, so `tsc` type-checks them — but the TEMPLATE
    // lives in a sibling `.html` that only the AOT compiler reads. A build is the only
    // check that covers both.
    typecheckCmd: "npx ng build --configuration development",
    fileSuffixes: [".component"],
    idioms: {
      label: "Angular",
      fileConvention:
        "`src/app/components/<component-name>/<component-name>.component.ts` (+ `.html` / `.scss` siblings)",
      props:
        "signal inputs — `variant = input<'primary'|'secondary'>('primary')` (Angular 17.1+). Fall back to `@Input()` " +
        "only if the installed Angular version predates signal inputs",
      events:
        "`output<void>()` (or `@Output() EventEmitter`), bound in the template as `(click)`. Angular event binding is " +
        "`(click)`, NOT `@click` — `@click` is Vue syntax and will not compile here",
      slots: '`<ng-content />` (multi-slot via `select="…"`)',
      variants:
        "host and class bindings driven by the component's own inputs (`[class]`, `host: { '[class.btn--primary]': '…' }`) " +
        "plus component classes. Do NOT reach for `CVA` here: in Angular `CVA` means `ControlValueAccessor`, an " +
        "unrelated forms interface, and the acronym will produce the wrong code",
      styleScoping:
        "`ViewEncapsulation.Emulated` (the default) — Angular attribute-scopes the component's own stylesheet",
      exports: "an exported component class with `standalone: true` (the default since Angular 19)",
      refs:
        "`viewChild()` / `ElementRef`. Angular's own `forwardRef` is a dependency-injection helper for circular " +
        "references — it is NOT React's ref forwarding, do not use it for that",
      pitfalls: [
        "`tsc --noEmit` checks the class but NOT the template — a broken template still passes, so the gate is a build.",
        "`CVA` in Angular is `ControlValueAccessor`, not `class-variance-authority`.",
        "Template events are `(click)`, not `@click`.",
      ],
    },
  },
  astro: {
    sourceExts: [".astro"],
    typecheckCmd: "npx astro check",
    fileSuffixes: [],
    idioms: {
      label: "Astro",
      fileConvention: "`src/components/<ComponentName>.astro`; pages are `src/pages/<route>.astro`",
      props: "`interface Props { … }` in the frontmatter, read via `const { variant = 'primary' } = Astro.props`",
      events:
        "`.astro` components render to static HTML with NO client JS. Interactivity needs a framework island " +
        "(`<Counter client:load />`) or a plain `<script>` tag — do not write handler props on an `.astro` component",
      slots: '`<slot />` (named slots via `<slot name="…" />`)',
      variants:
        "compute the class string in the frontmatter and bind it with `class={…}`. Frontmatter runs at " +
        "BUILD time, so a variant library (cva/clsx) works here and ships no client JS — it is simply " +
        "usually unnecessary, since a plain template literal or lookup does the same job without a dependency",
      styleScoping: "`<style>` in the component, auto-scoped by Astro via a `data-astro-cid-*` attribute",
      exports: "`.astro` files export nothing and are imported as a default — `import Button from './Button.astro'`",
      refs: "not applicable — there is no component instance at runtime",
      pitfalls: ["`tsc` cannot parse `.astro` — the check is `astro check`."],
    },
  },
  vanilla: {
    // A vanilla component is an HTML partial plus its own CSS (see the toolkit's
    // `docs/framework-config.md` → Vanilla); the partial is the component file.
    sourceExts: [".html", ".js"],
    typecheckCmd: null,
    fileSuffixes: [],
    idioms: {
      label: "Vanilla HTML/CSS/JS",
      fileConvention: "`<component_dir>/<component-name>.html` plus a sibling `<component-name>.css`",
      props: "`data-*` attributes on the root element, read in JS; or arguments to an exported factory function",
      events: "`addEventListener` in an ES module — there is no framework binding syntax",
      slots: "a designated child container the caller fills, or `<template>` plus cloning",
      variants:
        "BEM modifier classes (`.btn--primary`, `.btn--sm`) toggled from a `data-variant` attribute. Do NOT install " +
        "`class-variance-authority` or `clsx` — this target has no bundler",
      styleScoping: "a plain sibling CSS file, scoped by BEM naming; no compiler scoping exists",
      exports: "ES module named exports for any JS behaviour; the markup partial has no export",
      refs: "direct DOM references (`querySelector`)",
      pitfalls: [
        "There is no build step: no JSX, no bundler-only imports, no CVA/clsx.",
        "There is NO type-check, so the CODE verify layer must report blocked rather than pass.",
      ],
    },
  },
};

/** React is the fallback: it is what an unset or unrecognized `framework` behaved as before. */
export function profileFor(framework?: string | null): FrameworkProfile {
  return FRAMEWORK_PROFILES[(framework ?? "").toLowerCase()] ?? FRAMEWORK_PROFILES.react;
}

/**
 * Every extension any supported framework can emit, most specific first so a prefix
 * extension never shadows a longer one. Scanners that run without a resolved framework
 * (the component index reads a project directory, not a config) use this union: a file
 * still only matches a roster entry when its stem normalizes to the component's name,
 * so a wider extension set costs nothing in precision.
 */
export const ALL_SOURCE_EXTS: string[] = [
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
  ".astro",
  ".html",
  ".ts",
  ".js",
];

/** Every `fileSuffixes` entry across the table, for framework-agnostic name matching. */
export const ALL_FILE_SUFFIXES: string[] = [".component"];

/**
 * Strip a framework's filename suffix from a bare stem, so `button.component` matches the
 * roster entry `button`. Returns the stem unchanged when no suffix applies.
 */
export function stripFileSuffix(stem: string): string {
  for (const suffix of ALL_FILE_SUFFIXES) {
    if (stem.toLowerCase().endsWith(suffix)) return stem.slice(0, -suffix.length);
  }
  return stem;
}

/**
 * The type-check command for the CODE verify layer. Returns `null` for frameworks with no
 * meaningful check — callers must then say so rather than emit a command that passes
 * vacuously.
 */
export function typecheckCmdFor(framework?: string | null): string | null {
  return profileFor(framework).typecheckCmd;
}

/**
 * The authoring idioms for a framework, or `null` when the framework is unset or unknown.
 *
 * Deliberately does NOT share `profileFor`'s React fallback. Falling back is right for
 * detection — accepting a few extra extensions costs nothing, while missing one marks real
 * components as never-built. It is wrong for idioms: handing an unknown framework React's
 * conventions is precisely the leak this table exists to stop, and it would assert
 * `forwardRef`/CVA/named-export rules about a framework that has none of them. A null here
 * means the prompt says nothing about idioms rather than something false.
 */
export function idiomsFor(framework?: string | null): FrameworkIdioms | null {
  const key = (framework ?? "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(FRAMEWORK_PROFILES, key)
    ? FRAMEWORK_PROFILES[key].idioms
    : null;
}

/**
 * What a build is told when the configured framework is unset or unrecognized.
 *
 * An earlier version returned "" here, on the reasoning that saying nothing beats saying
 * something false. That was fail-OPEN: with no clause the build proceeds anyway and the
 * model falls back to its own habit, which is React — the original bug. Silence is not
 * neutral when the default is wrong. So an unknown framework now gets an explicit STOP.
 */
const UNKNOWN_FRAMEWORK_CLAUSE = [
  "FRAMEWORK CONTRACT — STOP. The project's `framework` is unset or is not one of the frameworks VortSpec",
  `supports (${Object.keys(FRAMEWORK_PROFILES).join(", ")}).`,
  "Do NOT generate any component. Do NOT infer the framework from the files you find, and do NOT default to",
  "React — defaulting is the exact failure this contract exists to prevent. Read `.sdd-de/project.yaml`; if",
  "`framework` is missing or unrecognized, write no code and report that the project needs `/setup` to record",
  "a supported framework.",
].join("\n");

/**
 * The precedence rule (change: framework-profile-idioms).
 *
 * The toolkit's own `component-standards.md` and `styling-best-practices.md` still mandate
 * CVA + `cn()` + `.variants.ts` + `forwardRef` for ALL nine frameworks, and `/generate-artifacts`
 * loads them. Without a stated precedence the agent gets two contradictory instructions and
 * picks one at random — which is the inconsistency this whole change is unwinding. This says
 * which one wins.
 */
const PRECEDENCE_CLAUSE =
  "This contract OVERRIDES any conflicting instruction in the toolkit's standards docs " +
  "(`component-standards.md`, `styling-best-practices.md`, `framework-config.md`) and in any skill they load. " +
  "Those documents state React's architecture — CVA, `cn()`, `.variants.ts`, `forwardRef` — as if it were " +
  "framework-agnostic; it is not. Where they disagree with the contract above, the contract above wins.";

/**
 * The framework's conventions as a prompt block, so a build states what to emit instead of
 * deferring to "the configured framework" and leaving the model to infer it. An unknown or
 * unset framework yields an explicit STOP rather than an empty string — see
 * `UNKNOWN_FRAMEWORK_CLAUSE`.
 */
export function frameworkIdiomClause(framework?: string | null): string {
  const i = idiomsFor(framework);
  if (!i) return UNKNOWN_FRAMEWORK_CLAUSE;
  const lines = [
    `FRAMEWORK CONTRACT — this project is ${i.label} (\`framework: ${(framework ?? "").toLowerCase()}\`). ` +
      `Emit idiomatic ${i.label} code, not React-shaped code translated into it:`,
    `- File: ${i.fileConvention}`,
    `- Props: ${i.props}`,
    `- Events: ${i.events}`,
    `- Children/slots: ${i.slots}`,
    `- Variants: ${i.variants}`,
    `- Style scoping: ${i.styleScoping}`,
    `- Export: ${i.exports}`,
    `- Refs: ${i.refs}`,
  ];
  if (i.pitfalls.length) lines.push(`- Do NOT get these wrong: ${i.pitfalls.join(" ")}`);
  lines.push(PRECEDENCE_CLAUSE);
  return lines.join("\n");
}

/** Whether VortSpec can generate for this framework — i.e. it has a profile. */
export function isGeneratableFramework(framework?: string | null): boolean {
  return idiomsFor(framework) !== null;
}

/**
 * A human-readable reason generation cannot proceed, or `null` when it can.
 *
 * Exported so a CALLER can refuse before starting a run, rather than relying only on the
 * prompt's STOP text. Prompt STOP is defense in depth — it is prose the model can read past —
 * so anything that can gate earlier should use this.
 */
export function frameworkSupportError(framework?: string | null): string | null {
  if (isGeneratableFramework(framework)) return null;
  const shown = framework ? `"${framework}"` : "unset";
  return (
    `The project's framework is ${shown}, which VortSpec cannot generate for. ` +
    `Run /setup and record one of: ${Object.keys(FRAMEWORK_PROFILES).join(", ")}.`
  );
}
