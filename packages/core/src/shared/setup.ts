import { z } from "zod";

/**
 * The SDD-DE project setup questionnaire — a faithful GUI port of the
 * `npx @royvillasana/sdd-de` interactive init (bin/sdd-de.js). The renderer
 * asks these before a project is created; the main process writes the answers
 * to `.sdd-de/project.yaml` in the exact CLI format and installs the toolkit.
 */

export const frameworkSchema = z.enum([
  "react",
  "next",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "angular",
  "astro",
  "vanilla",
]);
export const languageSchema = z.enum(["typescript", "javascript"]);
export const designSourceSchema = z.enum([
  "figma",
  "library",
  "github",
  "stitch",
  "claude-design",
  "zip",
  // Connect Enterprise Design System (change: connect-enterprise-design-system): the client already
  // has a coded component library + Storybook + tokens + knowledge base; VortSpec CONSUMES them.
  "enterprise",
]);
/** How the client's Storybook is reached for an enterprise project. */
export const enterpriseStorybookKindSchema = z.enum(["url", "static", "repo"]);
/** How the client's knowledge base is reached (docs repo / site → generic connector; mcp → their server). */
export const enterpriseKbKindSchema = z.enum(["docs-repo", "site", "mcp"]);
export const componentLibrarySchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "antd",
  "chakra",
  "mantine",
  "headlessui",
  "astryx",
  "other",
]);
export const stylingSchema = z.enum([
  "tailwind",
  "css-modules",
  "scss",
  "styled-components",
  "emotion",
  "css",
]);
export const testRunnerSchema = z.enum(["vitest", "jest", "playwright", "cypress", "none"]);
export const stitchConnectionSchema = z.enum(["mcp", "zip"]);

export const setupAnswersSchema = z.object({
  framework: frameworkSchema,
  language: languageSchema,
  designSource: designSourceSchema,
  // Figma
  figmaFileUrl: z.string().optional(),
  figmaTokenCollection: z.string().optional(),
  // Library
  componentLibrary: componentLibrarySchema.optional(),
  // Resolved provisioning kind — for `other`/unknown libraries the flow asks; for known
  // libraries it derives from `componentLibrary` via `libraryKind()` (change: provision-library-source).
  componentLibraryKind: z
    .enum(["cli-registry", "installed-package", "headless", "copy-source", "package"])
    .optional(),
  // GitHub
  githubRepoUrl: z.string().optional(),
  githubBranch: z.string().optional(),
  githubComponentDir: z.string().optional(),
  // ZIP
  zipFilePath: z.string().optional(),
  zipComponentDir: z.string().optional(),
  // Stitch
  stitchConnection: stitchConnectionSchema.optional(),
  stitchApiKey: z.string().optional(),
  stitchProjectId: z.string().optional(),
  stitchZipPath: z.string().optional(),
  // Claude Design (live link, read via the design MCP)
  claudeDesignUrl: z.string().optional(),
  // Enterprise — Connect Enterprise Design System (consume an existing design system, don't rebuild).
  enterpriseStorybookKind: enterpriseStorybookKindSchema.optional(),
  enterpriseStorybookRef: z.string().optional(), // a URL, a static build dir, or a repo (per kind)
  enterpriseRepoUrl: z.string().optional(), // optional code repo (for importable components)
  enterpriseKbKind: enterpriseKbKindSchema.optional(),
  enterpriseKbRef: z.string().optional(), // a docs repo / site URL, or an MCP endpoint (per kind)
  // Common
  styling: stylingSchema,
  tokenFile: z.string(),
  componentDir: z.string(),
  testRunner: testRunnerSchema,
});
export type SetupAnswers = z.infer<typeof setupAnswersSchema>;

// ── Option metadata (labels/hints) for the wizard ────────────────────

export const FRAMEWORK_OPTIONS = [
  { value: "react", label: "React", hint: "Vite / CRA" },
  { value: "next", label: "Next.js", hint: "App Router" },
  { value: "vue", label: "Vue 3" },
  { value: "nuxt", label: "Nuxt 3" },
  { value: "svelte", label: "Svelte" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "angular", label: "Angular" },
  { value: "astro", label: "Astro" },
  { value: "vanilla", label: "Vanilla", hint: "HTML / CSS / JS" },
] as const;

export const DESIGN_SOURCE_OPTIONS = [
  { value: "figma", label: "Figma", hint: "Read frames, variables, and specs via the Figma MCP" },
  { value: "library", label: "Component Library", hint: "shadcn/ui, MUI, Ant Design, Chakra, Mantine…" },
  { value: "github", label: "GitHub Repository", hint: "A repo with your component library / design system" },
  { value: "stitch", label: "Google Stitch", hint: "Google's AI design tool — via the Stitch MCP" },
  { value: "claude-design", label: "Claude Design", hint: "A claude.ai/design project, read via the design MCP" },
  { value: "zip", label: "ZIP File", hint: "Exported from Stitch, Claude Design, or any other design tool" },
  { value: "enterprise", label: "Connect Enterprise Design System", hint: "Consume your existing components, Storybook, tokens & knowledge base — not rebuild them" },
] as const;

/**
 * How a component library is CONSUMED into a project (change: consume-component-libraries):
 *   - `cli-registry`      — the library's CLI copies component *source files* into the repo
 *     (shadcn). Consume by running that CLI; the copied files ARE the design system.
 *   - `installed-package` — components are imported from an installed npm package (mui, chakra,
 *     antd, mantine, astryx). Consume by installing the package; never own the source.
 *   - `headless`          — installed unstyled primitives with no token model (radix, headlessui);
 *     consume by install + pair with the project's own tokens.
 * `other` has no fixed kind — the setup flow asks.
 *
 * Legacy `copy-source` (→ `cli-registry`) and `package` (→ `installed-package`) values from older
 * project.yaml still parse; use {@link normalizeLibraryKind} to map them.
 */
export type LibraryKind = "cli-registry" | "installed-package" | "headless";
/** Legacy kind values accepted from older project.yaml, mapped by {@link normalizeLibraryKind}. */
export type LegacyLibraryKind = "copy-source" | "package";

export const COMPONENT_LIBRARY_OPTIONS = [
  { value: "shadcn", label: "shadcn/ui", hint: "Radix UI + Tailwind", kind: "cli-registry" },
  { value: "radix", label: "Radix UI", hint: "unstyled primitives", kind: "headless" },
  { value: "mui", label: "Material UI", hint: "Emotion-based", kind: "installed-package" },
  { value: "antd", label: "Ant Design", kind: "installed-package" },
  { value: "chakra", label: "Chakra UI", hint: "Emotion-based", kind: "installed-package" },
  { value: "mantine", label: "Mantine", kind: "installed-package" },
  { value: "headlessui", label: "Headless UI", hint: "Tailwind Labs", kind: "headless" },
  { value: "astryx", label: "Astryx", hint: "Meta · installed + CLI", kind: "installed-package" },
  { value: "other", label: "Other" },
] as const;

/**
 * Per-library consume recipe: the exact toolchain commands + import base VortSpec writes into
 * project.yaml so consuming is deterministic (change: consume-component-libraries). Commands run
 * through the user's own local toolchain (npm/npx) — never vendored.
 */
export interface LibraryRecipe {
  kind: LibraryKind;
  /** Non-interactive install / init command. */
  install: string;
  /** cli-registry only: how to add a component (append names). */
  add?: string;
  /** Import specifier (installed) or alias-resolved dir (cli-registry). */
  importBase?: string;
  /** cli-registry only: the registry base URL. */
  registry?: string;
}
export const LIBRARY_RECIPES: Record<string, LibraryRecipe> = {
  shadcn: {
    kind: "cli-registry",
    install: "npx shadcn@latest init --yes --defaults",
    add: "npx shadcn@latest add --yes",
    importBase: "@/components/ui",
    registry: "https://ui.shadcn.com/r",
  },
  radix: { kind: "headless", install: "npm install radix-ui", importBase: "radix-ui" },
  headlessui: { kind: "headless", install: "npm install @headlessui/react", importBase: "@headlessui/react" },
  mui: {
    kind: "installed-package",
    install: "npm install @mui/material @emotion/react @emotion/styled",
    importBase: "@mui/material",
  },
  antd: { kind: "installed-package", install: "npm install antd", importBase: "antd" },
  chakra: {
    kind: "installed-package",
    install: "npm install @chakra-ui/react @emotion/react",
    importBase: "@chakra-ui/react",
  },
  mantine: {
    kind: "installed-package",
    install: "npm install @mantine/core @mantine/hooks",
    importBase: "@mantine/core",
  },
  // Astryx (Meta) — installed package + a CLI that generates agent docs to learn the conventions.
  // Commands per the user-provided docs (astryx.atmeta.com); setup verifies the packages resolve
  // (research could not independently confirm them). (change: consume-component-libraries)
  astryx: {
    kind: "installed-package",
    install:
      "npm install @astryxdesign/core @astryxdesign/theme-neutral @astryxdesign/cli && npx @astryxdesign/cli init",
    importBase: "@astryxdesign/core",
  },
};

/**
 * The consume kind for a component library. Returns `"unknown"` for `other` or any
 * unrecognized library, so the caller asks the user rather than guessing a command.
 */
export function libraryKind(library: string | undefined | null): LibraryKind | "unknown" {
  const opt = COMPONENT_LIBRARY_OPTIONS.find((o) => o.value === library);
  return opt && "kind" in opt ? opt.kind : "unknown";
}

/** Map a legacy kind value (from older project.yaml) to the current taxonomy; pass-through otherwise. */
export function normalizeLibraryKind(kind: string | undefined | null): LibraryKind | undefined {
  if (kind === "copy-source") return "cli-registry";
  if (kind === "package") return "installed-package";
  if (kind === "cli-registry" || kind === "installed-package" || kind === "headless") return kind;
  return undefined;
}

/** Auto-detected library at intake — suggests which component library the target repo already uses. */
export interface LibraryDetection {
  /** A {@link componentLibrarySchema} value when a component library is detected. */
  library?: string;
  kind?: LibraryKind;
  /** True when ONLY a CSS-in-JS styling lib is present — a styling strategy, not a component source. */
  stylingOnly?: boolean;
  detail: string;
}

/** Dependency → component library. Order matters: first match wins. */
const DEP_TO_LIBRARY: Array<{ dep: string | RegExp; library: string }> = [
  { dep: "@mui/material", library: "mui" },
  { dep: "@chakra-ui/react", library: "chakra" },
  { dep: "@mantine/core", library: "mantine" },
  { dep: "antd", library: "antd" },
  { dep: "@astryxdesign/core", library: "astryx" },
  { dep: "@headlessui/react", library: "headlessui" },
  { dep: /^@radix-ui\//, library: "radix" },
  { dep: "radix-ui", library: "radix" },
];

/**
 * Inspect a target repo's dependency names + whether it has a root `components.json` to suggest the
 * component library and its consume kind at intake (change: consume-component-libraries). A root
 * `components.json` implies shadcn (cli-registry); a known UI package implies installed-package/
 * headless; only a CSS-in-JS lib implies a styling strategy with no component source. Pure.
 */
export function detectLibrary(
  deps: Record<string, string> | undefined,
  hasComponentsJson: boolean,
): LibraryDetection {
  const names = Object.keys(deps ?? {});
  if (hasComponentsJson) {
    return { library: "shadcn", kind: "cli-registry", detail: "Found a root components.json → shadcn (cli-registry)." };
  }
  for (const { dep, library } of DEP_TO_LIBRARY) {
    const hit = typeof dep === "string" ? names.includes(dep) : names.some((n) => dep.test(n));
    if (hit) {
      const k = libraryKind(library);
      return {
        library,
        kind: k === "unknown" ? undefined : k,
        detail: `Found ${typeof dep === "string" ? dep : "a @radix-ui/* package"} in dependencies → ${library}.`,
      };
    }
  }
  if (names.some((n) => n.startsWith("@emotion/") || n === "styled-components")) {
    return {
      stylingOnly: true,
      detail: "Only a CSS-in-JS styling library (Emotion/styled-components) — a styling strategy, not a component source.",
    };
  }
  return { detail: "No known component library detected in dependencies." };
}

/**
 * Design sources that CONSUME an existing component system and MUST NOT rebuild its
 * components from scratch — `enterprise` (a client's coded system) and `library` (an existing
 * component library). Callers use this to exclude such projects from the from-scratch build
 * cycle and to route foundation/readiness/design-reference through the consume path rather than
 * the rebuild path. (change: consume-component-libraries)
 */
export function isConsumeSource(designSource: string | undefined | null): boolean {
  return designSource === "enterprise" || designSource === "library";
}

export const STYLING_OPTIONS = [
  { value: "tailwind", label: "Tailwind CSS" },
  { value: "css-modules", label: "CSS Modules" },
  { value: "scss", label: "SCSS / Sass" },
  { value: "styled-components", label: "Styled Components" },
  { value: "emotion", label: "Emotion" },
  { value: "css", label: "Vanilla CSS" },
] as const;

export const TEST_RUNNER_OPTIONS = [
  { value: "vitest", label: "Vitest" },
  { value: "jest", label: "Jest" },
  { value: "playwright", label: "Playwright" },
  { value: "cypress", label: "Cypress" },
  { value: "none", label: "None" },
] as const;

// ── Auto-suggestions (ported from the CLI) ───────────────────────────

export function autoStyling(
  framework: string,
  designSource: string,
  library?: string,
): string {
  if (designSource === "library" && library) {
    const map: Record<string, string> = {
      shadcn: "tailwind",
      headlessui: "tailwind",
      mui: "emotion",
      chakra: "emotion",
      mantine: "css-modules",
      antd: "scss",
      radix: "css-modules",
      astryx: "css", // StyleX ships pre-built CSS / CSS variables
    };
    if (map[library]) return map[library];
  }
  if (
    designSource === "github" ||
    designSource === "zip" ||
    designSource === "stitch" ||
    designSource === "claude-design"
  ) {
    return "css-modules";
  }
  const map: Record<string, string> = {
    next: "tailwind",
    angular: "scss",
    vue: "css-modules",
    nuxt: "css-modules",
  };
  return map[framework] ?? "css-modules";
}

export function autoTokenFile(framework: string): string {
  const map: Record<string, string> = {
    next: "app/globals.css",
    nuxt: "assets/css/tokens.css",
    svelte: "src/app.css",
    sveltekit: "src/app.css",
    angular: "src/styles/tokens.css",
    astro: "src/styles/tokens.css",
    vanilla: "css/tokens.css",
  };
  return map[framework] ?? "src/styles/tokens.css";
}

export function autoComponentDir(framework: string): string {
  const map: Record<string, string> = {
    nuxt: "components",
    svelte: "src/lib/components",
    sveltekit: "src/lib/components",
    astro: "src/components",
  };
  return map[framework] ?? "src/components";
}

/** The parsed subset of `.sdd-de/project.yaml` the flow reads back. */
export const projectConfigSchema = z.object({
  designSource: z.string().optional(),
  figmaFileUrl: z.string().optional(),
  figmaTokenCollection: z.string().optional(),
  componentLibrary: z.string().optional(),
  componentLibraryKind: z.string().optional(),
  // Consume descriptor (change: consume-component-libraries) — the exact toolchain commands +
  // import base for the selected library, so consuming is deterministic.
  libraryInstallCmd: z.string().optional(),
  libraryAddCmd: z.string().optional(),
  libraryImportBase: z.string().optional(),
  libraryRegistry: z.string().optional(),
  githubRepoUrl: z.string().optional(),
  githubBranch: z.string().optional(),
  githubComponentDir: z.string().optional(),
  zipFilePath: z.string().optional(),
  stitchConnection: z.string().optional(),
  claudeDesignUrl: z.string().optional(),
  // Enterprise (Connect Enterprise Design System) — the connected assets we consume.
  storybookSourceKind: z.string().optional(),
  storybookSource: z.string().optional(),
  enterpriseRepoUrl: z.string().optional(),
  knowledgeBaseKind: z.string().optional(),
  knowledgeBase: z.string().optional(),
  framework: z.string().optional(),
  language: z.string().optional(),
  styling: z.string().optional(),
  tokenFile: z.string().optional(),
  componentDir: z.string().optional(),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Build `.sdd-de/project.yaml` exactly as the CLI does. */
export function buildProjectYaml(a: SetupAnswers): string {
  const lines: string[] = [
    "# SDD-DE Project Configuration",
    "# Generated by VortSpec — update any time your stack changes.",
    "# See .sdd-de/docs/framework-config.md for framework-specific guidance.",
    "",
    `framework: ${a.framework}`,
    `language: ${a.language}`,
    `styling: ${a.styling}`,
    "",
    "# Design system source: figma | library | github | stitch | claude-design | zip | enterprise",
    `design_source: ${a.designSource}`,
  ];

  if (a.designSource === "figma") {
    lines.push(`figma_file_url: "${a.figmaFileUrl ?? ""}"`);
    lines.push(`figma_token_collection: ${a.figmaTokenCollection || "Tokens"}`);
  } else if (a.designSource === "library") {
    const lib = a.componentLibrary ?? "other";
    lines.push(`component_library: ${lib}`);
    // Consume kind: derive for a known library, else the answered kind for `other` (normalized).
    const kind = libraryKind(a.componentLibrary);
    const resolved = kind === "unknown" ? normalizeLibraryKind(a.componentLibraryKind) : kind;
    if (resolved) lines.push(`component_library_kind: ${resolved}`);
    // Consume descriptor: deterministic toolchain commands + import base for a known library.
    const recipe = LIBRARY_RECIPES[lib];
    if (recipe) {
      lines.push(`library_install_cmd: "${recipe.install}"`);
      if (recipe.add) lines.push(`library_add_cmd: "${recipe.add}"`);
      if (recipe.importBase) lines.push(`library_import_base: "${recipe.importBase}"`);
      if (recipe.registry) lines.push(`library_registry: "${recipe.registry}"`);
    }
  } else if (a.designSource === "github") {
    lines.push(`github_repo_url: "${a.githubRepoUrl ?? ""}"`);
    lines.push(`github_branch: ${a.githubBranch || "main"}`);
    lines.push(`github_component_dir: ${a.githubComponentDir || "src/components"}`);
  } else if (a.designSource === "zip") {
    lines.push(`zip_file_path: "${a.zipFilePath ?? ""}"`);
    lines.push(`zip_component_dir: ${a.zipComponentDir || "src/components"}`);
  } else if (a.designSource === "stitch") {
    lines.push(`stitch_connection: ${a.stitchConnection ?? "mcp"}`);
    if (a.stitchConnection === "mcp") {
      lines.push(`stitch_api_key: "${a.stitchApiKey ?? ""}"`);
      lines.push(`stitch_project_id: "${a.stitchProjectId ?? ""}"`);
    } else {
      lines.push(`stitch_zip_path: "${a.stitchZipPath ?? ""}"`);
    }
  } else if (a.designSource === "claude-design") {
    lines.push(`claude_design_url: "${a.claudeDesignUrl ?? ""}"`);
  } else if (a.designSource === "enterprise") {
    // Consume an existing design system: point at the client's Storybook (required), and optionally
    // their code repo, knowledge base, and (read-only) Figma. VortSpec references these, never copies.
    lines.push(`storybook_source_kind: ${a.enterpriseStorybookKind ?? "url"}`);
    lines.push(`storybook_source: "${a.enterpriseStorybookRef ?? ""}"`);
    if (a.enterpriseRepoUrl) lines.push(`enterprise_repo_url: "${a.enterpriseRepoUrl}"`);
    if (a.enterpriseKbRef) {
      lines.push(`knowledge_base_kind: ${a.enterpriseKbKind ?? "docs-repo"}`);
      lines.push(`knowledge_base: "${a.enterpriseKbRef}"`);
    }
    if (a.figmaFileUrl) lines.push(`figma_file_url: "${a.figmaFileUrl}"`); // optional, read-only
  }

  lines.push("");
  lines.push(`token_file: ${a.tokenFile}`);
  lines.push(`component_dir: ${a.componentDir}`);
  lines.push(`test_runner: ${a.testRunner}`);

  return lines.join("\n") + "\n";
}
