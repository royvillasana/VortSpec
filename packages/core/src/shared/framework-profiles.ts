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
}

/** Stories are never components, in any framework. */
const NEVER_A_COMPONENT = [".stories", ".variants", ".test", ".spec"] as const;

/**
 * Each framework gets its OWN frozen record — no shared object identity between rows, so a
 * future edit to one framework can never silently change another (Nuxt already needs a
 * different type-check from Vue for exactly this reason).
 */
export const FRAMEWORK_PROFILES: Readonly<Record<Framework, FrameworkProfile>> = Object.freeze({
  react: Object.freeze({
    sourceExts: [".tsx", ".jsx", ".ts", ".js"],
    typecheckCmd: "npx tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  next: Object.freeze({
    sourceExts: [".tsx", ".jsx", ".ts", ".js"],
    typecheckCmd: "npx tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  vue: Object.freeze({
    sourceExts: [".vue"],
    // `tsc` skips `.vue` entirely; `vue-tsc` is the compiler-aware wrapper.
    typecheckCmd: "npx vue-tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  nuxt: Object.freeze({
    sourceExts: [".vue"],
    // NOT plain `vue-tsc`: Nuxt generates `.nuxt/` types for auto-imports, routes and
    // composables, so a bare vue-tsc run reports errors on code that is actually fine and
    // misses the generated surface entirely. `nuxi typecheck` prepares those types first.
    typecheckCmd: "npx nuxi typecheck",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  svelte: Object.freeze({
    sourceExts: [".svelte"],
    // `svelte-check` is the only checker that reads `.svelte`; `--threshold error` keeps the
    // gate on real failures rather than a11y warnings.
    typecheckCmd: "npx svelte-check --threshold error",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  sveltekit: Object.freeze({
    sourceExts: [".svelte"],
    typecheckCmd: "npx svelte-check --threshold error",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  angular: Object.freeze({
    // The component IS the `.ts` class; the sibling `.html` is its template, not a second
    // component — counting templates as components double-counts every Angular roster entry.
    sourceExts: [".ts"],
    // Angular class files are plain `.ts`, so `tsc` type-checks them — but the TEMPLATE lives
    // in a sibling `.html` that only the AOT compiler reads. A build covers both.
    typecheckCmd: "npx ng build --configuration development",
    fileSuffixes: [".component"],
    nonComponentSuffixes: [...NEVER_A_COMPONENT, ".module", ".service", ".routes", ".config", ".guard"],
  }),
  astro: Object.freeze({
    sourceExts: [".astro"],
    typecheckCmd: "npx astro check",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
  vanilla: Object.freeze({
    // A vanilla component is an HTML partial plus its own CSS (see the toolkit's
    // `docs/framework-config.md` → Vanilla); the partial is the component file.
    sourceExts: [".html", ".js"],
    // No build step exists to check, so there is nothing that could fail — callers MUST
    // report BLOCKED rather than treating the absence of a check as a pass.
    typecheckCmd: null,
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
  }),
});

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
  | { kind: "cmd"; cmd: string }
  /** The framework is supported but has no check to run — the layer is BLOCKED, not passed. */
  | { kind: "none"; framework: string }
  /** The framework is absent or unrecognized — nothing can be claimed about it. */
  | { kind: "unknown"; framework: string | null };

/**
 * Resolve the CODE layer's command. Every outcome is explicit so no caller can mistake
 * "we could not check" for "the check passed".
 */
export function resolveTypecheck(framework?: string | null): TypecheckResolution {
  const profile = profileFor(framework);
  // Normalize "" to null: an empty `framework:` key in project.yaml is "unset", not a name.
  if (!profile) return { kind: "unknown", framework: framework || null };
  if (!profile.typecheckCmd) return { kind: "none", framework: framework as string };
  return { kind: "cmd", cmd: profile.typecheckCmd };
}
