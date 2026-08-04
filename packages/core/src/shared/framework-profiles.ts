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
   * A project setting `typecheckCmd` DEPENDS ON to mean what we claim, or undefined when the
   * command's coverage does not vary with project config.
   *
   * The vanilla case taught us that a check which reads nothing must say so rather than report
   * pass. Angular is the harder version of the same failure: the command is right, runs, and
   * reports exit 0 — while silently not checking the thing we most need checked. Coverage that
   * depends on config has to be READ, not assumed, or the CODE layer reports a pass it did not
   * earn. See `typecheckCoverageClause()`.
   */
  typecheckCoverageGate?: {
    /** The setting, named exactly as it appears in the project's config. */
    setting: string;
    /**
     * How to resolve the value that actually APPLIES — not merely where a copy of it may sit.
     *
     * Naming a file is not enough when the setting inherits: "absent here" and "false" are
     * different answers, and treating them alike downgrades a project whose coverage is fine.
     */
    resolution: string;
    /** What goes unchecked while it is off — stated narrowly, to what was demonstrated. */
    unchecked: string;
  };
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
   * React-specific: in Svelte a helper-built dynamic class weakens unused-selector diagnostics
   * for the element carrying it (it does NOT break styling — see the svelte row), and in Angular
   * `CVA` names an unrelated forms interface.
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
  // CORRECTED TWICE on 2026-08-04. Both wrong versions are recorded as WRONG, in order, because
  // an earlier draft of this comment stated the second one as if it were the fix — leaving the
  // refuted rule in the artifact as the thing a maintainer would read first.
  //
  //   WRONG v1: a class name built in an external module is invisible to the compiler, so its
  //             `<style>` rules are stripped and the component ships unstyled. `class:` was made
  //             a REQUIREMENT on that basis. Refuted: nothing is stripped in either shape.
  //   WRONG v2: a dynamic `class` makes EVERY selector unprovable and switches unused-selector
  //             analysis off. Refuted: it is far narrower than that.
  //
  //   ACTUAL (svelte 5.56.8): the compiler still does structural reachability. A dynamic class
  //   defeats only the CLASS-NAME part of the proof, and only for the element carrying it. So
  //   `.never` beside `<button class={x}>` is retained unwarned, while `div.never` and a child's
  //   `p.never` are both commented out AND warned.
  //
  // Evidence: RESEARCH/VORTSPEC_SVELTE_FIXTURE_2026-08-04.md (Bumble, the v1 refutation) and
  // RESEARCH/VORTSPEC_SVELTE_CSS_SCOPE_CONTROL_2026-08-04.md (the v2 refutation, rerun here).
  // The boundary is enforced by executable cases in `.scratch/svelte-fixture` (`node verify.mjs`):
  //   P4-scope-keep   — a selector that COULD match the dynamically-classed element is retained
  //   P4-scope-tag    — a structurally impossible selector is still pruned AND warned
  //   P4-scope-child  — a statically-classed child is still analysed beside a dynamic parent
  // If this prose ever drifts back to WRONG v2, P4-scope-tag is the case that contradicts it, and
  // `framework-prose.test.ts` fails on the restatement.
  //
  // The recommendation survives on its true benefit, downgraded from requirement to preference.
  variants:
    "prefer `class:` directives (`class:btn--primary={variant === 'primary'}`) or a `data-variant={variant}` " +
    "attribute styled with an attribute selector (`[data-variant='primary'] { … }`). Both keep that element's " +
    "class set statically visible, so Svelte's unused-selector diagnostic still applies to it. A class string " +
    "built by a helper works and nothing is stripped — the cost is narrower: for the element CARRYING the dynamic " +
    "class, the compiler cannot rule out any selector that could match it, so a dead or misspelled rule on that " +
    "element ships undiagnosed. Selectors it can still exclude structurally — a different tag, a different element " +
    "— are reported either way. A preference for keeping that diagnostic, not a correctness requirement",
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
  // `tsc` does not merely skip `.vue` — on a project that also contains a real `.ts` file it exits
  // 0 and never mentions the `.vue` error at all. (With no `.ts` at all it exits non-zero, but as
  // TS18003 "no inputs were found", which looks like a check and is the absence of one.)
  // `vue-tsc` is the compiler-aware wrapper. Evidence: Bumble, RESEARCH/VORTSPEC_VUE_FIXTURE_2026-08-04.md.
  typecheckCmd: "npx vue-tsc --noEmit",
  // Deliberately NO `typecheckCoverageGate`, unlike angular. Two claims were wrong when one was
  // added, both refuted by Bumble's fixture on vue 3.5.40 / vue-tsc 2.2.12 (VORTSPEC_VUE_FIXTURE):
  //
  //   WRONG v1: an undeclared prop is "dropped at render". Rendered, `<Button :cout="7" />`
  //             produces `<button cout="7">42</button>` — the default IS retained, and the
  //             misspelling is FORWARDED onto the root as a junk attribute, not dropped. Vue calls
  //             this fallthrough: https://vuejs.org/guide/components/attrs.html
  //   WRONG v2: it is "the same false-green shape as Angular". It is not. Angular's gap accepts a
  //             PROVABLY wrong binding (`[count]="'a string'"` has no correct reading) and the
  //             remedy is free. `strictTemplates` cannot read intent: `:cout` (TS2561, "did you
  //             mean 'count'?"), `aria-label` and `data-testid` (both TS2353) are one mechanism and
  //             it rejects all three; only `class`/`style` are exempt. Gating on it would mark a
  //             project PARTIAL for declining a flag that rejects its own accessibility attributes.
  //
  // ACTUAL: `vue-tsc` checks declared prop TYPES with the flag off, so the command is sufficient
  // for the hand-off `ng build` was not. The residue is the TYPO class — vue distinguishes
  // "misspelled a declared prop" (TS2561) from "undeclared attribute" (TS2353) — which is a real
  // seam and a product-policy call, not a coverage defect to downgrade unilaterally.
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
      pitfalls: [
        "`tsc` cannot parse `.vue` — the check is `vue-tsc`. A bare `tsc` pass proves nothing: on a project that also has a `.ts` file it exits 0 without ever mentioning the `.vue` error.",
        "Spell every prop exactly as the component declares it. Unless the project sets `vueCompilerOptions.strictTemplates`, a misspelled prop is NOT a compile error — Vue forwards it to the root element as a stray DOM attribute (`:cout` renders `cout=\"7\"`) while the real prop silently keeps its default.",
      ],
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
      "A helper-built class string is NOT stripped by the compiler — that is a myth. It only suppresses the unused-selector warning for selectors that could match that element; ones ruled out structurally are still reported.",
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
    // Angular class files are plain `.ts`, so `tsc` type-checks them — but the TEMPLATE lives in
    // a sibling `.html` that only the AOT compiler reads, so the build is the only check that
    // reaches it at all.
    //
    //   WRONG v1: "a build is the only check that COVERS BOTH". Refuted by Bumble on
    //             @angular/compiler-cli 19.x — necessary, not sufficient. The same binding
    //             (`[count]="'not a number'"` into `@Input() count: number`) compiles CLEAN at
    //             exit 0 without `strictTemplates` and fails TS2322 with it. What the flag
    //             governs is narrow: expressions inside a template are checked either way, but
    //             BINDINGS BETWEEN COMPONENTS are not. Evidence:
    //             RESEARCH/VORTSPEC_ANGULAR_FIXTURE_2026-08-04.md, case A5-scope.
    //
    // That gap is precisely VortSpec's hand-off — we generate components carrying inputs and then
    // generate pages that bind to them — so the pitfall below states it rather than the comment.
    typecheckCmd: "npx ng build --configuration development",
    typecheckCoverageGate: {
      setting: "strictTemplates",
      resolution:
        "read `angular.json` for the tsconfig the build target you are checking actually uses " +
        "(`projects.<project>.architect.build.options.tsConfig`, plus any override under the selected " +
        "`configurations` entry), then follow that file's `extends` chain. `angularCompilerOptions` INHERIT: " +
        "the base applies and the leaf overrides it, so judge the EFFECTIVE value. A leaf that omits the " +
        "setting while a base sets it is still `true` — absent in the leaf is NOT false. If you cannot " +
        "resolve the effective value, say so and treat coverage as unproven rather than guessing either way",
      unchecked:
        "the assignability of values BOUND ACROSS a component boundary, in both directions — " +
        "`[count]=\"'text'\"` against `@Input() count: number`, and an `(changed)` handler taking the wrong " +
        "type off an `EventEmitter<number>` — each compiles clean at exit 0. Expressions inside a template " +
        "are still checked either way, so the gap is narrower than the template as a whole",
    },
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
        "A passing build does NOT mean the bindings are checked. Without `strictTemplates` in `tsconfig`'s `angularCompilerOptions`, Angular type-checks expressions inside a template but NOT bindings between components, so `[count]=\"'text'\"` into an `@Input() count: number` compiles clean. Turn it on, or treat binding errors as uncaught.",
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
 * The instruction that turns a config-dependent check into an honest report, or "" when the
 * framework's coverage does not vary with config.
 *
 * Bumble compiled the case this exists for: on Angular, the same wrong binding compiles at exit 0
 * without `strictTemplates` and fails TS2322 with it. `ng build` is the right command and the
 * wrong stopping point — VortSpec generates components carrying inputs and then generates pages
 * that bind to them, so an unchecked binding is the failure mode of our own hand-off.
 *
 * Documenting that as a caveat while still reporting a full pass would be the vacuous green this
 * whole clause exists to remove, so the setting must be READ and a shortfall must DOWNGRADE the
 * verdict — the same shape as the not-applicable branch a no-build project already gets.
 *
 * Evidence: RESEARCH/VORTSPEC_ANGULAR_FIXTURE_2026-08-04.md, @angular/compiler-cli 19.2.25 /
 * TypeScript 5.6.3 — pinned exactly because this is version-sensitive compiler behaviour.
 *   A4-*      — an `@Input()` binding: clean at exit 0 without the flag, TS2322 with it
 *   A6-out-*  — the `@Output()` half, same result, so "both directions" is run rather than assumed
 *   A5-scope  — expressions inside a template fail in BOTH modes, which is why this is scoped to
 *               bindings across a component boundary and not to templates at large
 *
 * The inheritance half is why this resolves a value rather than reading a file. Thor caught that
 * naming a tsconfig turns a project with correct coverage into a false PARTIAL; I ran it on the
 * same compiler rather than taking it (`.scratch/angular-fixture/inherit-control`, same bad
 * binding in all three):
 *   I1  leaf sets strictTemplates: true          → exit 1, TS2322
 *   I2  leaf `extends` a base that sets it, and
 *       OMITS the flag itself                    → exit 1, TS2322  (absent ≠ false)
 *   I3  leaf extends that base, overrides false  → exit 0, clean   (the leaf wins)
 * I3 is the discriminating one: without it, I2 failing would be consistent with the check simply
 * always failing, and the inheritance conclusion would be unearned.
 */
export function typecheckCoverageClause(framework?: string | null): string {
  const gate = profileFor(framework).typecheckCoverageGate;
  if (!gate) return "";
  return (
    ` Before reporting CODE, resolve \`${gate.setting}\`: ${gate.resolution}. A pass means nothing for ` +
    `${gate.unchecked} unless the effective value is \`true\`. If it resolves to false, or you cannot ` +
    `resolve it, report CODE as PARTIAL — never a full pass — name \`${gate.setting}\` as the reason, and ` +
    `say that turning it on is what makes the check meaningful. Do NOT silently accept the exit code.`
  );
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
  "framework-agnostic; it is not. Where they disagree with the contract above, the contract above wins. " +
  "`.sdd-de/docs/framework-rules.md` carries these same rules on disk for the skills that read docs " +
  "rather than this prompt; it is generated from the same source and says the same thing.";

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
