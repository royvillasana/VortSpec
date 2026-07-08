import { z } from "zod";

/**
 * The SDD-DE guided flow model. Stages are data-driven so they can be aligned
 * to the real SDD-DE CLI cycle once confirmed (seam: `DEFAULT_FLOW`). Flow state
 * is persisted as plain JSON in the project (`.vortspec/flow.json`) so it is
 * always derivable from disk and survives closing/reopening the app.
 */

export const stageKindSchema = z.enum([
  "source",
  "components",
  "input",
  "intake",
  "agent",
  "verify",
  "manifest",
]);
export type StageKind = z.infer<typeof stageKindSchema>;

export const stageStatusSchema = z.enum([
  "pending",
  "running",
  "needs-review",
  "approved",
  "failed",
]);
export type StageStatus = z.infer<typeof stageStatusSchema>;

export const stageDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: stageKindSchema,
  /** produces an artifact that must be approved before advancing */
  gated: z.boolean().default(false),
  /** not required for the flow to be considered complete (e.g. publishing to
   *  GitHub). Optional stages can be run/skipped freely and never block. */
  optional: z.boolean().optional(),
  /** relative path of the artifact this stage produces, if any (fixed path) */
  artifact: z.string().optional(),
  /** filename suffix to resolve under specs/ when the path is dynamic
   *  (SDD-DE writes specs/[feature-name]/…, so the feature name is not known ahead of time) */
  artifactGlob: z.string().optional(),
  /** prompt handed to Claude Code for agent/verify stages */
  promptTemplate: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
});
export type StageDef = z.infer<typeof stageDefSchema>;

export const stageStateSchema = z.object({
  id: z.string(),
  status: stageStatusSchema,
  updatedAt: z.string(),
  decisionNotes: z.string().optional(),
});
export type StageState = z.infer<typeof stageStateSchema>;

/** A component detected in the design source, written to `.sdd-de/components.json`. */
export const detectedComponentSchema = z.object({
  name: z.string(),
  level: z.enum(["atom", "molecule", "organism"]).optional(),
  description: z.string().optional(),
});
export type DetectedComponent = z.infer<typeof detectedComponentSchema>;
export const detectedComponentsSchema = z.array(detectedComponentSchema);

export const COMPONENTS_MANIFEST = ".sdd-de/components.json";

export const flowStateSchema = z.object({
  currentStageId: z.string(),
  stages: z.array(stageStateSchema),
  /** Opt-in GitHub publish target (a repo URL). Only the URL is stored — never
   *  credentials; the push runs through the user's own git/gh in the commit stage. */
  publishRepoUrl: z.string().optional(),
});
export type FlowState = z.infer<typeof flowStateSchema>;

/** The full flow presented to the renderer: definitions + live state. */
export const flowSchema = z.object({
  definitions: z.array(stageDefSchema),
  state: flowStateSchema,
});
export type Flow = z.infer<typeof flowSchema>;

// ── Run history (US-11) ──────────────────────────────────────────────

export const runStageSummarySchema = z.object({
  name: z.string(),
  decision: z.string(),
  status: z.enum(["done", "review", "cancelled", "pending"]),
});
export type RunStageSummary = z.infer<typeof runStageSummarySchema>;

export const runSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  outcome: z.enum(["running", "in-review", "passed", "cancelled", "failed", "in-progress"]),
  updatedAt: z.string(),
  stages: z.array(runStageSummarySchema),
  artifacts: z.array(z.string()),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const runHistoryResultSchema = z.object({ runs: z.array(runSummarySchema) });
export type RunHistoryResult = z.infer<typeof runHistoryResultSchema>;

/**
 * The SDD-DE mandatory cycle (from @royvillasana/sdd-de docs/sdd-mandatory-steps.md).
 * The app drives these exact steps via the installed skills (`/enrich-brief`,
 * `/generate-artifacts`, `/visual-verify`, `/sync-tokens`, `/commit`) — it never
 * invents methodology. Skill invocation works in headless `-p` mode.
 */
export const DEFAULT_FLOW: StageDef[] = [
  {
    id: "design-system",
    title: "Design system",
    summary:
      "Connect to your configured design source (e.g. the Figma file), extract design tokens + variables, and detect every component — no brief needed.",
    kind: "source",
    gated: true,
    artifact: COMPONENTS_MANIFEST,
    promptTemplate:
      "Read .sdd-de/project.yaml for `design_source` and the project configuration " +
      "(framework, language, token_file, component_dir). Connect to the configured source — do NOT " +
      "ask for a brief; the design source is the input.\n\n" +
      "For `design_source: figma`, use the Figma MCP to read the file at `figma_file_url` and the " +
      "variable collection named `figma_token_collection`.\n\n" +
      "For `design_source: github` (a repository imported into this project), the repo's own files ARE " +
      "the source: scan them for the design system — read its existing token definitions (CSS variables, " +
      "Tailwind/theme config, SCSS/JS token files) and its component library, and reconcile them into the " +
      "configured `token_file` and inventory. Do not fetch anything remotely; read the files on disk.\n\n" +
      "1. Extract every design token and variable from the source into the configured `token_file`.\n" +
      "2. Detect every component in the design system and write `.sdd-de/components.json` — a JSON " +
      "array of objects `{ \"name\": string, \"level\": \"atom\"|\"molecule\"|\"organism\", " +
      "\"description\": string }`, ordered tokens → atoms → molecules → organisms.\n\n" +
      "Do NOT implement the components yet — this stage only extracts tokens and detects the inventory.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "components",
    title: "Components",
    summary:
      "Choose to build every detected component at once, or one by one. Each is generated in your framework and language using the extracted tokens.",
    kind: "components",
    gated: true,
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  {
    id: "visual-verify",
    title: "Visual verify",
    summary:
      "/visual-verify — compare the implementation to the spec across viewports; a11y audit; list discrepancies.",
    kind: "verify",
    gated: true,
    // The skill writes specs/<component>/visual-verify-report.md — surface the
    // newest one in the approval gate so this stage can be reviewed + approved.
    artifactGlob: "visual-verify-report.md",
    promptTemplate:
      "/visual-verify\n\nRun the visual-verify skill: compare the live implementation to the spec across 375/768/1440px, check every token, variant, and state, run the accessibility audit, and report discrepancies.",
    allowedTools: ["Read", "Bash"],
  },
  {
    id: "sync",
    title: "Sync",
    summary:
      "/sync-tokens — reconcile the token-decisions log and token files with the decisions made during implementation.",
    kind: "agent",
    gated: false,
    // Write the decisions log to `.sdd-de/design-decisions.md`, NOT `design.md`:
    // on case-insensitive macOS `design.md` is the same file as the Google-format
    // `DESIGN.md`, so writing there would clobber the manifest.
    promptTemplate:
      "/sync-tokens\n\nRun the sync-tokens skill: reconcile token files with the implementation and " +
      "maintain the token-decisions log at `.sdd-de/design-decisions.md` (NOT `design.md` — on macOS that " +
      "collides with the Google-format DESIGN.md). No undocumented deviations.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "design-manifest",
    title: "Design manifest",
    summary:
      "/design-doc — generate DESIGN.md: the tokens, component contracts, and conventions any AI coding agent reads to build on-brand screens. Review and approve before publishing.",
    kind: "manifest",
    gated: true,
    // The design-doc skill writes DESIGN.md at the project root (reader also
    // tolerates .sdd-de/design.md). Surface it for the approval gate.
    artifact: "DESIGN.md",
    promptTemplate:
      "/design-doc\n\nRun the design-doc skill: generate and validate DESIGN.md with @google/design.md, capturing every design token, component contract (props, states, tokens consumed), and convention as the AI hand-off file. Install @google/design.md if it is missing. Do not modify the components themselves.",
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  {
    id: "commit",
    title: "Commit & publish",
    summary:
      "Optional — keep everything local, or connect a GitHub repo and publish from here using your own git/gh.",
    kind: "agent",
    gated: false,
    optional: true,
    promptTemplate:
      "/commit\n\nRun the commit skill: commit the changes and open a PR whose description is the component spec, with the Figma link and QA screenshots. No direct pushes to main.",
    allowedTools: ["Read", "Bash"],
  },
];
