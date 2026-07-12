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
]);
export const componentLibrarySchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "antd",
  "chakra",
  "mantine",
  "headlessui",
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
] as const;

export const COMPONENT_LIBRARY_OPTIONS = [
  { value: "shadcn", label: "shadcn/ui", hint: "Radix UI + Tailwind" },
  { value: "radix", label: "Radix UI", hint: "unstyled primitives" },
  { value: "mui", label: "Material UI", hint: "Emotion-based" },
  { value: "antd", label: "Ant Design" },
  { value: "chakra", label: "Chakra UI", hint: "Emotion-based" },
  { value: "mantine", label: "Mantine" },
  { value: "headlessui", label: "Headless UI", hint: "Tailwind Labs" },
  { value: "other", label: "Other" },
] as const;

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
  githubRepoUrl: z.string().optional(),
  githubBranch: z.string().optional(),
  githubComponentDir: z.string().optional(),
  zipFilePath: z.string().optional(),
  stitchConnection: z.string().optional(),
  claudeDesignUrl: z.string().optional(),
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
    "# Design system source: figma | library | github | stitch | claude-design | zip",
    `design_source: ${a.designSource}`,
  ];

  if (a.designSource === "figma") {
    lines.push(`figma_file_url: "${a.figmaFileUrl ?? ""}"`);
    lines.push(`figma_token_collection: ${a.figmaTokenCollection || "Tokens"}`);
  } else if (a.designSource === "library") {
    lines.push(`component_library: ${a.componentLibrary ?? "other"}`);
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
  }

  lines.push("");
  lines.push(`token_file: ${a.tokenFile}`);
  lines.push(`component_dir: ${a.componentDir}`);
  lines.push(`test_runner: ${a.testRunner}`);

  return lines.join("\n") + "\n";
}
