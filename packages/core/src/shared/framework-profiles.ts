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
}

const REACT_LIKE: FrameworkProfile = {
  sourceExts: [".tsx", ".jsx", ".ts", ".js"],
  typecheckCmd: "npx tsc --noEmit",
  fileSuffixes: [],
};

const VUE_LIKE: FrameworkProfile = {
  sourceExts: [".vue"],
  // `tsc` skips `.vue` entirely; `vue-tsc` is the compiler-aware wrapper.
  typecheckCmd: "npx vue-tsc --noEmit",
  fileSuffixes: [],
};

const SVELTE_LIKE: FrameworkProfile = {
  sourceExts: [".svelte"],
  // `svelte-check` is the only checker that reads `.svelte`; `--threshold error` keeps
  // the gate on real failures rather than a11y warnings.
  typecheckCmd: "npx svelte-check --threshold error",
  fileSuffixes: [],
};

export const FRAMEWORK_PROFILES: Record<string, FrameworkProfile> = {
  react: REACT_LIKE,
  next: REACT_LIKE,
  vue: VUE_LIKE,
  nuxt: VUE_LIKE,
  svelte: SVELTE_LIKE,
  sveltekit: SVELTE_LIKE,
  angular: {
    sourceExts: [".ts"],
    // Angular class files are plain `.ts`, so `tsc` type-checks them — but the TEMPLATE
    // lives in a sibling `.html` that only the AOT compiler reads. A build is the only
    // check that covers both.
    typecheckCmd: "npx ng build --configuration development",
    fileSuffixes: [".component"],
  },
  astro: {
    sourceExts: [".astro"],
    typecheckCmd: "npx astro check",
    fileSuffixes: [],
  },
  vanilla: {
    // A vanilla component is an HTML partial plus its own CSS (see the toolkit's
    // `docs/framework-config.md` → Vanilla); the partial is the component file.
    sourceExts: [".html", ".js"],
    typecheckCmd: null,
    fileSuffixes: [],
  },
};

/** React is the fallback: it is what an unset or unrecognized `framework` behaved as before. */
export function profileFor(framework?: string | null): FrameworkProfile {
  return FRAMEWORK_PROFILES[(framework ?? "").toLowerCase()] ?? REACT_LIKE;
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
