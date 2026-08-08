import { frameworkSchema } from "./setup";

/**
 * Per-framework facts, as DATA rather than prose.
 *
 * VortSpec offers nine frameworks (`frameworkSchema`), but the facts that distinguish them
 * were until now hardcoded, separately, in every consumer that needed them — and those
 * copies disagreed. `component-reader.ts` looked for `.tsx/.jsx/.vue/.svelte/.ts` while
 * `scan-cache.ts` also accepted `.astro/.js`; `verifyPrompt` ran `npx tsc --noEmit` for all
 * nine even though `tsc` cannot parse `.vue`, `.svelte`, or `.astro` at all. The result was
 * a pipeline that reported success on frameworks it had not checked.
 *
 * This table is the single place those facts live. It is deliberately narrow — it holds
 * only what the detection and verification consumers need today. Authoring idioms (variant
 * strategy, props/slot/ref conventions, styling) belong on the same record and should be
 * ADDED here rather than re-derived in a prompt string.
 *
 * It FAILS CLOSED. An unrecognized framework resolves to no profile at all, and callers
 * must then report the check as impossible — never silently fall back to React's `tsc`,
 * which is the exact false-green this module exists to eliminate.
 */

export type Framework = (typeof frameworkSchema.options)[number];

/** What VortSpec needs to know about a framework to find and check its components. */
export interface FrameworkProfile {
  /**
   * Extensions a component file can carry. Used to decide whether a component on the
   * roster actually exists on disk.
   */
  readonly sourceExts: readonly string[];
  /**
   * The framework-native type/template check, or `null` when the framework genuinely has
   * none (a no-build vanilla project). `null` means callers report the CODE layer BLOCKED —
   * it does NOT mean "pass". `npx tsc --noEmit` is correct ONLY for the frameworks whose
   * components are plain `.ts`/`.tsx`.
   */
  readonly typecheckCmd: string | null;
  /**
   * Filename suffixes that sit between the component name and the extension, stripped
   * before matching a file to a roster entry. Angular's convention is
   * `button.component.ts`, whose stem would otherwise never equal `button`.
   */
  readonly fileSuffixes: readonly string[];
  /**
   * Suffixes that mark a file as NOT a component even though its extension matches —
   * Angular's `.spec`/`.module`/`.service` siblings, and every framework's stories.
   */
  readonly nonComponentSuffixes: readonly string[];
  /** `storybook init --type` hint, or `null` to let Storybook auto-detect. */
  readonly storybookType: string | null;
  /**
   * Directories a scan must walk to find components and the pages that render them, beyond the
   * project's configured `component_dir`.
   *
   * Adopted from the reference `codebase-index` script, which carries the same per-framework list.
   * A design system is not only what sits under `component_dir`: an Astro project keeps layouts in
   * `src/layouts` and pages in `src/pages`, a SvelteKit project keeps routes in `src/routes`, and a
   * Next app router lives in `app/`. Walking only `src` and `component_dir` makes every instance
   * rendered in those directories invisible, which silently understates adoption.
   */
  readonly scanDirs: readonly string[];
  /**
   * How completely VortSpec can verify this framework. `experimental` means a real check
   * exists but does not cover everything the framework can get wrong — the verify prompt
   * says so, so a pass is never read as broader than it is.
   */
  readonly supportLevel: "supported" | "experimental";
  /**
   * Where the check runs. `component-dir` means the command must be BUILT against the
   * project's own source directory rather than swept across the repo — an unscoped run
   * fails on generated or vendored files nobody authored. Explicit rather than inferred
   * from `supportLevel`, so a future experimental framework does not silently inherit
   * vanilla's JS sweep.
   */
  readonly typecheckScope: "project" | "component-dir";
  /**
   * A project setting `typecheckCmd` DEPENDS ON to mean what we claim, or undefined when the
   * command's coverage does not vary with project config. Distinct from `partial`: `partial`
   * states an UNCONDITIONAL shortfall (vanilla is always JS-syntax-only), this one must be
   * RESOLVED against the project before it can be claimed. Collapsing the two would mark a
   * correctly-configured Angular project PARTIAL.
   */
  readonly typecheckCoverageGate?: {
    readonly setting: string;
    readonly resolution: string;
    readonly unchecked: string;
  };
  /**
   * How code for this framework is actually WRITTEN — what the build prompt emits, so it states
   * real conventions instead of letting the model fall back to React habits.
   */
  readonly idioms: FrameworkIdioms;
}

/**
 * Directories that hold generated, vendored, or tool output rather than source. One list,
 * because "what is not source" is a framework fact like any other and was previously copied
 * into every walker that needed it.
 */
export const GENERATED_DIRS: readonly string[] = Object.freeze([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".vortspec",
  ".sdd-de",
  "storybook-static",
]);

/** Stories are never components, in any framework. */
const NEVER_A_COMPONENT = [".stories", ".variants", ".test", ".spec"] as const;

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

/**
 * Each framework gets its OWN frozen record — no shared object identity between rows, so a
 * future edit to one framework can never silently change another (Nuxt already needs a
 * different type-check from Vue for exactly this reason).
 */
const RAW_PROFILES = {
  react: Object.freeze({
    sourceExts: [".tsx", ".jsx", ".ts", ".js"],
    typecheckCmd: "npx tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "react",
    scanDirs: ["src/components", "src/pages", "components", "app"],
    supportLevel: "supported",
    typecheckScope: "project",
    idioms: {
      label: "React (Vite)",
      fileConvention: "`<component_dir>/<category>/<ComponentName>.tsx` (PascalCase file, kebab-case folder)",
      ...REACT_BASE,
      pitfalls: ["`forwardRef` is deprecated in React 19 — check the installed version before reaching for it."],
    },
  }),
  next: Object.freeze({
    sourceExts: [".tsx", ".jsx", ".ts", ".js"],
    typecheckCmd: "npx tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "nextjs",
    scanDirs: ["components", "app", "pages", "src/components", "src/app"],
    supportLevel: "supported",
    typecheckScope: "project",
    idioms: {
      label: "Next.js (App Router)",
      fileConvention: "`<component_dir>/<category>/<component-name>.tsx`; pages are `app/<route>/page.tsx`",
      ...REACT_BASE,
      pitfalls: [
        "Server Components are the default — add `'use client'` ONLY when the component uses state, effects, event handlers, or browser APIs.",
        "`forwardRef` is deprecated in React 19 — check the installed version before reaching for it.",
      ],
    },
  }),
  vue: Object.freeze({
    sourceExts: [".vue"],
    // `tsc` skips `.vue` entirely; `vue-tsc` is the compiler-aware wrapper.
    typecheckCmd: "npx vue-tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "vue3",
    scanDirs: ["src/components", "src/views", "src/pages"],
    supportLevel: "supported",
    typecheckScope: "project",
    idioms: {
      label: "Vue 3",
      fileConvention: "`<component_dir>/<category>/<ComponentName>.vue` (single-file component)",
      ...VUE_BASE,
      pitfalls: [
        "`tsc` cannot parse `.vue` — the check is `vue-tsc`. A bare `tsc` pass proves nothing: on a project that also has a `.ts` file it exits 0 without ever mentioning the `.vue` error.",
        "Spell every prop exactly as the component declares it. Unless the project sets `vueCompilerOptions.strictTemplates`, a misspelled prop is NOT a compile error — Vue forwards it to the root element as a stray DOM attribute (`:cout` renders `cout=\"7\"`) while the real prop silently keeps its default.",
      ],
    },
  }),
  nuxt: Object.freeze({
    sourceExts: [".vue"],
    // NOT plain `vue-tsc` — `nuxi typecheck` runs `nuxt prepare` first, and that is the whole
    // difference. Compiled, scripts/framework-fixtures/nuxt (nuxt 3.21.10 / vue-tsc 2.2.12):
    //
    //   .nuxt/ present   bare `vue-tsc --noEmit`   exit 0, clean   (case A)
    //   .nuxt/ absent    bare `vue-tsc --noEmit`   exit 2, TS5083 "Cannot read file
    //                    .nuxt/tsconfig.json" cascading into TS2468/TS2583 missing-lib  (case B)
    //   .nuxt/ absent    `npx nuxi typecheck`      exit 0 - it REGENERATES .nuxt/ itself (case C)
    //
    //   WRONG v1: "a bare vue-tsc run reports errors on code that is actually fine". Refuted by
    //   case B: what it reports is a CONFIG load failure, not spurious diagnostics on components,
    //   and by case A, where the same command on the same sources is clean once `.nuxt/` exists.
    //
    // ACTUAL: the command is right for the reason that it self-prepares. On a fresh checkout -
    // CI, or any clone that has never run dev/build - `.nuxt/` does not exist, so bare `vue-tsc`
    // cannot even load its tsconfig. Exit codes observed: 2 on a real type error, 1 when no root
    // `tsconfig.json` exists at all (a config failure, NOT a type failure - do not report it as one).
    typecheckCmd: "npx nuxi typecheck",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "vue3",
    scanDirs: ["components", "pages", "layouts", "app"],
    supportLevel: "supported",
    typecheckScope: "project",
    idioms: {
      label: "Nuxt 3",
      fileConvention: "`components/<ComponentName>.vue` — Nuxt auto-imports these, so do NOT add manual imports",
      ...VUE_BASE,
      pitfalls: [
        "Components under `components/` are auto-imported; an explicit import is redundant and often wrong.",
        // Was Vue's pitfall verbatim, naming `vue-tsc` as the check - which contradicted this same
        // record's `typecheckCmd` two fields above, and was EMITTED to every Nuxt build by
        // `frameworkIdiomClause`. Compiled and corrected; see the typecheckCmd comment for the cases.
        "`tsc` cannot parse `.vue`, and for Nuxt the check is `nuxi typecheck` - NOT bare `vue-tsc`. " +
          "`nuxi typecheck` runs `nuxt prepare`, which generates the `.nuxt/` types the auto-imports " +
          "and routes depend on; on a checkout where `.nuxt/` does not exist yet, bare `vue-tsc` cannot " +
          "even read its tsconfig and fails with TS5083 before it type-checks anything.",
      ],
    },
  }),
  svelte: Object.freeze({
    sourceExts: [".svelte"],
    // `svelte-check` is the only checker that reads `.svelte`; `--threshold error` keeps the
    // gate on real failures rather than a11y warnings.
    typecheckCmd: "npx svelte-check --threshold error",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "svelte",
    scanDirs: ["src/components", "src/lib", "src/routes"],
    supportLevel: "supported",
    typecheckScope: "project",
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
  }),
  sveltekit: Object.freeze({
    sourceExts: [".svelte"],
    // `svelte-kit sync` FIRST — this is not Svelte's command with a different label.
    //
    //   WRONG v1: SvelteKit "likely inherits" Svelte's result, so the same `svelte-check` line
    //   serves both. Refuted by scripts/framework-fixtures/sveltekit, case SK3
    //   (@sveltejs/kit 2.70.2 / svelte-check 3.8.6): with `.svelte-kit/` absent, bare
    //   `svelte-check` exits 1 on CORRECT, unmodified code with "Cannot find module './$types'".
    //   SK4 restores the directory and the same sources exit 0, so the failure is the missing
    //   generated types and not damage to the project.
    //
    // ACTUAL: Svelte has no generated types; SvelteKit does — `./$types` per route, produced by
    // `svelte-kit sync`. `svelte-check` does not run it. Same shape as Nuxt, opposite ergonomics:
    // `nuxi typecheck` self-prepares, so its command needs no help; `svelte-check` does not, so
    // the sync has to be part of the command or a fresh checkout fails for a reason that has
    // nothing to do with the code being checked.
    typecheckCmd: "npx svelte-kit sync && npx svelte-check --threshold error",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "sveltekit",
    scanDirs: ["src/lib", "src/routes", "src/components"],
    supportLevel: "supported",
    typecheckScope: "project",
    idioms: {
      label: "SvelteKit",
      fileConvention: "`src/lib/components/<ComponentName>.svelte`; routes are `src/routes/<route>/+page.svelte`",
      ...SVELTE_BASE,
      pitfalls: [
        "`tsc` cannot parse `.svelte` — the check is `svelte-check`, and for SvelteKit it must be " +
          "preceded by `svelte-kit sync`: the per-route `./$types` are GENERATED, and without them " +
          "`svelte-check` fails on correct code with \"Cannot find module './$types'\".",
        "Import components through the `$lib` alias, not deep relative paths.",
      ],
    },
  }),
  angular: Object.freeze({
    // The component IS the `.ts` class; the sibling `.html` is its template, not a second
    // component — counting templates as components double-counts every Angular roster entry.
    sourceExts: [".ts"],
    // Angular class files are plain `.ts`, so `tsc` type-checks them — but the TEMPLATE lives in
    // a sibling `.html` that only the AOT compiler reads, so the build is the only check that
    // reaches it at all.
    //
    //   WRONG v1: "a build COVERS BOTH". Refuted by Bumble on @angular/compiler-cli 19.2.25 —
    //             necessary, not sufficient. The same binding (`[count]="'not a number'"` into
    //             `@Input() count: number`) compiles CLEAN at exit 0 without `strictTemplates`
    //             and fails TS2322 with it, in BOTH directions (A4-* input, A6-out-* output).
    //             Expressions inside a template are checked either way (A5-scope), so the gap is
    //             bindings across a component boundary — see `typecheckCoverageGate` below.
    //             Evidence: RESEARCH/VORTSPEC_ANGULAR_FIXTURE_2026-08-04.md.
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
    nonComponentSuffixes: [...NEVER_A_COMPONENT, ".module", ".service", ".routes", ".config", ".guard"],
    storybookType: "angular",
    scanDirs: ["src/app"],
    supportLevel: "supported",
    typecheckScope: "project",
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
  }),
  astro: Object.freeze({
    sourceExts: [".astro"],
    typecheckCmd: "npx astro check",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "html",
    scanDirs: ["src/components", "src/layouts", "src/pages"],
    supportLevel: "supported",
    typecheckScope: "project",
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
  }),
  vanilla: Object.freeze({
    // A vanilla component is an HTML partial plus its own CSS (see the toolkit's
    // `docs/framework-config.md` → Vanilla); the partial is the component file.
    sourceExts: [".html", ".js"],
    // Built by `vanillaCheckCmd()` at resolve time so it can be SCOPED to the project's own
    // component directory. An unscoped sweep of the repo fails on generated or vendored JS
    // that no component author wrote — a broken `dist/bundle.js` would block a component
    // whose source is fine.
    typecheckCmd: null,
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "html",
    scanDirs: ["src", "components"],
    supportLevel: "experimental",
    typecheckScope: "component-dir",
    // `node --check` cannot see an ES-MODULE syntax error unless the module mode is DECIDED.
    // Compiled by Honey (PR #83): the same `export function f( {` is exit 0 with no
    // `package.json`, exit 1 with `{"type":"module"}`, and exit 1 with `{"type":"commonjs"}`.
    // The mode does not have to be right, it has to be resolvable.
    //
    // That lands precisely on this profile: `idioms.events` mandates "an ES module", while the
    // same record describes a target with no build step and no bundler — a shape that plausibly
    // ships no `package.json` at all. So the gate is blind to exactly the syntax this profile
    // tells authors to write, in exactly the project shape it describes.
    typecheckCoverageGate: {
      setting: "package.json \"type\"",
      resolution:
        "look for the nearest `package.json` at or above the component directory and read its `type` " +
        "field. Either \"module\" or \"commonjs\" is enough — the value does not need to be correct, " +
        "only PRESENT, because it is the ambiguity that blinds the check rather than the choice. If " +
        "there is no `package.json`, or it has no `type`, the mode is undecided",
      unchecked:
        "ES-MODULE syntax errors — `import`/`export` at positions only valid in a module. A file whose " +
        "only defect is module-level syntax passes `node --check` silently when the mode is undecided, " +
        "so report the JS gate as covering non-module syntax ONLY and say the module surface was not " +
        "checked. Do not report it as a pass over the whole file",
    },
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
  }),
} satisfies Record<Framework, FrameworkProfile>;

/**
 * Deep-frozen: the nested extension/suffix arrays are frozen too, so a consumer cannot
 * mutate another consumer's view by pushing onto an array it was handed.
 */
export const FRAMEWORK_PROFILES: Readonly<Record<Framework, FrameworkProfile>> = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_PROFILES).map(([name, p]) => [
      name,
      Object.freeze({
        ...p,
        sourceExts: Object.freeze([...p.sourceExts]),
        scanDirs: Object.freeze([...p.scanDirs]),
        fileSuffixes: Object.freeze([...p.fileSuffixes]),
        nonComponentSuffixes: Object.freeze([...p.nonComponentSuffixes]),
      }),
    ]),
  ) as Record<Framework, FrameworkProfile>,
);

/**
 * The profile for a configured framework, or `null` when the value is absent or not one we
 * support. FAILS CLOSED on purpose: silently returning React's profile for a typo or a
 * framework added to the menu without a row here would run `tsc` against files it cannot
 * parse and report a pass — the precise defect this module was written to remove.
 */
export function profileFor(framework?: string | null): FrameworkProfile | null {
  if (!framework) return null;
  return FRAMEWORK_PROFILES[framework.toLowerCase() as Framework] ?? null;
}

/**
 * Every extension any supported framework can emit, most specific first so a prefix
 * extension never shadows a longer one. Scanners that run without a resolved framework (the
 * component index reads a project directory, not a config) use this union: a file still only
 * matches a roster entry when its stem normalizes to the component's name, so a wider
 * extension set costs nothing in precision.
 */
export const ALL_SOURCE_EXTS: readonly string[] = Object.freeze(
  [...new Set(Object.values(FRAMEWORK_PROFILES).flatMap((p) => p.sourceExts))].sort(
    (a, b) => b.length - a.length,
  ),
);

/** Every `fileSuffixes` entry across the table, for framework-agnostic name matching. */
export const ALL_FILE_SUFFIXES: readonly string[] = Object.freeze([
  ...new Set(Object.values(FRAMEWORK_PROFILES).flatMap((p) => p.fileSuffixes)),
]);

/** Every `nonComponentSuffixes` entry across the table. */
export const ALL_NON_COMPONENT_SUFFIXES: readonly string[] = Object.freeze([
  ...new Set(Object.values(FRAMEWORK_PROFILES).flatMap((p) => p.nonComponentSuffixes)),
]);

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
 * Extensions to SEARCH for a framework's components.
 *
 * Deliberately asymmetric with {@link resolveTypecheck}: resolution fails CLOSED (an
 * unknown framework can claim nothing), but search falls back to the union. Casting a wider
 * net while looking for a file cannot produce a false green — a file still only counts when
 * its stem normalizes to a roster entry's name — whereas running the wrong CHECKER reports a
 * pass it never earned. Safety lives on the claim, not on the search.
 */
export function sourceExtsFor(framework?: string | null): readonly string[] {
  return profileFor(framework)?.sourceExts ?? ALL_SOURCE_EXTS;
}

/** Whether a stem is a sibling artifact (story/spec/module) rather than a component. */
export function isNonComponentStem(stem: string, profile?: FrameworkProfile | null): boolean {
  const suffixes = profile?.nonComponentSuffixes ?? ALL_NON_COMPONENT_SUFFIXES;
  const lower = stem.toLowerCase();
  return suffixes.some((s) => lower.endsWith(s));
}

/** How the CODE verify layer can be run for a framework. */
export type TypecheckResolution =
  /** `partial` is set when the command runs but does not cover everything the framework can get wrong. */
  | { kind: "cmd"; cmd: string; partial?: string }
  /** The framework is supported but has no check to run — the layer is BLOCKED, not passed. */
  | { kind: "none"; framework: string }
  /** The framework is absent or unrecognized — nothing can be claimed about it. */
  | { kind: "unknown"; framework: string | null }
  /** The framework is known, but its configured paths are unusable — still not a pass. */
  | { kind: "invalid-config"; reason: string };

/**
 * POSIX single-quoting: wrap in `'…'` and close/escape/reopen around any embedded quote.
 * Inside single quotes the shell expands nothing, so this — not a metacharacter blocklist —
 * is what makes an arbitrary path safe to interpolate.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Control characters and newlines: never legitimate here, and they break the command apart. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Validate `component_dir` as a project-RELATIVE path, or return null.
 *
 * `component_dir` comes from `project.yaml`, which an agent writes — so it is untrusted input
 * that ends up inside a shell command the verify run executes. Containment (no absolute path,
 * no `..` escape) is enforced here; safety against metacharacters is enforced by
 * {@link shellQuote}. A blocklist of dangerous characters would be the wrong mechanism: it
 * fails open on whatever it forgot, and it would reject legitimate directory names.
 */
export function sanitizeComponentDir(dir?: string | null): string | null {
  const raw = (dir ?? "").trim();
  if (!raw) return null;
  if (CONTROL_CHARS.test(raw)) return null;
  if (raw.startsWith("/")) return null; // absolute — must stay inside the project
  if (/^[A-Za-z]:[\\/]/.test(raw)) return null; // Windows absolute
  const segments = raw.split(/[\\/]+/).filter((seg) => seg !== "" && seg !== ".");
  if (segments.length === 0) return null;
  if (segments.includes("..")) return null; // traversal out of the project
  return segments.join("/");
}

/**
 * Vanilla's syntax gate, scoped to `dir`, or `null` when `dir` is not a usable
 * project-relative path.
 *
 * `node --check` ships with Node, needs no install, respects package.json `type`, and exits
 * non-zero on a syntax error — a real gate that can fail. Scoping matters as much as the
 * command: sweeping the whole repo would fail on a minified bundle or a tool cache, blocking
 * component source that is perfectly valid.
 *
 * The path is validated and shell-quoted, and prefixed `./` so a directory whose name starts
 * with `-` is never read by `find` as an option.
 */
export function vanillaCheckCmd(dir?: string | null): string | null {
  const safe = sanitizeComponentDir(dir);
  if (!safe) return null;
  const prune = GENERATED_DIRS.map((d) => `-name ${shellQuote(d)}`).join(" -o ");
  // One `find`, no pipe. Every other shape tried here was a gate that could pass without
  // checking — the exact defect this module exists to remove:
  //   `-exec node --check {} +`      batches, and `node --check` reads only its FIRST
  //                                  argument; the rest of each batch goes unchecked.
  //   `-exec node --check {} \;`     runs per file, but `find` discards the child's status,
  //                                  so it always reports success.
  //   `… -print0 | xargs -0 -n1 …`   checks every file, but a pipeline returns only the LAST
  //                                  command's status — so a `find` that failed outright
  //                                  (missing or unreadable directory) fed `xargs` nothing
  //                                  and reported success having checked nothing.
  // The `sh -c` loop checks each file individually and exits on the first failure, and
  // `-exec … +` propagates that non-zero status through `find` — which also fails on its own
  // traversal errors, so a missing or unreadable directory is a failure rather than a pass.
  const perFile = `sh -c 'for f do node --check "$f" || exit 1; done' sh {} +`;
  return `find ${shellQuote(`./${safe}`)} \\( ${prune} \\) -prune -o -name '*.js' -exec ${perFile}`;
}

/** Where a project's own source lives, for checks that must not sweep generated output. */
export interface TypecheckContext {
  /** `component_dir` from project.yaml. Defaults to `src` when absent. */
  componentDir?: string | null;
}

/**
 * Resolve the CODE layer's command. Every outcome is explicit so no caller can mistake
 * "we could not check" for "the check passed".
 */
export function resolveTypecheck(
  framework?: string | null,
  ctx: TypecheckContext = {},
): TypecheckResolution {
  const profile = profileFor(framework);
  // Normalize "" to null: an empty `framework:` key in project.yaml is "unset", not a name.
  if (!profile) return { kind: "unknown", framework: framework || null };
  if (profile.typecheckScope === "component-dir") {
    const cmd = vanillaCheckCmd(ctx.componentDir || "src");
    // Fail closed: an unusable `component_dir` means no command can be built safely, and a
    // check that cannot run is BLOCKED — never a pass.
    if (!cmd) {
      return {
        kind: "invalid-config",
        reason: `component_dir (${ctx.componentDir ?? "unset"}) is not a usable project-relative path`,
      };
    }
    return {
      kind: "cmd",
      cmd,
      partial: "JS syntax only, scoped to the component directory — nothing bundled validates the HTML partials",
    };
  }
  if (!profile.typecheckCmd) return { kind: "none", framework: framework as string };
  return { kind: "cmd", cmd: profile.typecheckCmd };
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
 *   I4  an unrelated failure (missing module)    → TS2307, and NOT TS2322
 * I3 and I4 discriminate different things. Without I3, I2 failing is consistent with the check
 * simply always failing, and the inheritance conclusion is unearned. Without I4, the MEASUREMENT
 * can decay to "exited non-zero" and every other case still passes.
 */
export function typecheckCoverageClause(framework?: string | null): string {
  const gate = profileFor(framework)?.typecheckCoverageGate;
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
 * The fallback this must not share is `sourceExtsFor`'s, which returns the UNION of every
 * framework's extensions when the framework is unknown. Being over-inclusive is right for
 * DETECTION — accepting a few extra extensions costs nothing, while missing one marks real
 * components as never-built. It is wrong for idioms: handing an unknown framework React's
 * conventions is precisely the leak this table exists to stop, and it would assert
 * `forwardRef`/CVA/named-export rules about a framework that has none of them. A null here
 * means the prompt says nothing about idioms rather than something false.
 *
 * (`profileFor` itself is already fail-closed and returns null — it has no React fallback.
 * An earlier version of this comment said it did; that described the pre-#73 contract and
 * was carried into the merge unchanged, which is exactly the stale-prose failure this file
 * keeps finding in everyone else's work.)
 */
export function idiomsFor(framework?: string | null): FrameworkIdioms | null {
  // Reuses #73's fail-closed profileFor rather than re-implementing the lookup: one resolver,
  // so an unknown framework cannot be known here and unknown there.
  return profileFor(framework)?.idioms ?? null;
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
