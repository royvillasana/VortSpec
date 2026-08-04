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
    supportLevel: "supported",
    typecheckScope: "project",
  }),
  next: Object.freeze({
    sourceExts: [".tsx", ".jsx", ".ts", ".js"],
    typecheckCmd: "npx tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "nextjs",
    supportLevel: "supported",
    typecheckScope: "project",
  }),
  vue: Object.freeze({
    sourceExts: [".vue"],
    // `tsc` skips `.vue` entirely; `vue-tsc` is the compiler-aware wrapper.
    typecheckCmd: "npx vue-tsc --noEmit",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "vue3",
    supportLevel: "supported",
    typecheckScope: "project",
  }),
  nuxt: Object.freeze({
    sourceExts: [".vue"],
    // NOT plain `vue-tsc`: Nuxt generates `.nuxt/` types for auto-imports, routes and
    // composables, so a bare vue-tsc run reports errors on code that is actually fine and
    // misses the generated surface entirely. `nuxi typecheck` prepares those types first.
    typecheckCmd: "npx nuxi typecheck",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "vue3",
    supportLevel: "supported",
    typecheckScope: "project",
  }),
  svelte: Object.freeze({
    sourceExts: [".svelte"],
    // `svelte-check` is the only checker that reads `.svelte`; `--threshold error` keeps the
    // gate on real failures rather than a11y warnings.
    typecheckCmd: "npx svelte-check --threshold error",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "svelte",
    supportLevel: "supported",
    typecheckScope: "project",
  }),
  sveltekit: Object.freeze({
    sourceExts: [".svelte"],
    typecheckCmd: "npx svelte-check --threshold error",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "sveltekit",
    supportLevel: "supported",
    typecheckScope: "project",
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
    storybookType: "angular",
    supportLevel: "supported",
    typecheckScope: "project",
  }),
  astro: Object.freeze({
    sourceExts: [".astro"],
    typecheckCmd: "npx astro check",
    fileSuffixes: [],
    nonComponentSuffixes: [...NEVER_A_COMPONENT],
    storybookType: "html",
    supportLevel: "supported",
    typecheckScope: "project",
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
    supportLevel: "experimental",
    typecheckScope: "component-dir",
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
