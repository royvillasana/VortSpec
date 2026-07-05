import { z } from "zod";

/**
 * The SDD-DE guided flow model. Stages are data-driven so they can be aligned
 * to the real SDD-DE CLI cycle once confirmed (seam: `DEFAULT_FLOW`). Flow state
 * is persisted as plain JSON in the project (`.vortspec/flow.json`) so it is
 * always derivable from disk and survives closing/reopening the app.
 */

export const stageKindSchema = z.enum(["input", "intake", "agent", "verify"]);
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

export const flowStateSchema = z.object({
  currentStageId: z.string(),
  stages: z.array(stageStateSchema),
});
export type FlowState = z.infer<typeof flowStateSchema>;

/** The full flow presented to the renderer: definitions + live state. */
export const flowSchema = z.object({
  definitions: z.array(stageDefSchema),
  state: flowStateSchema,
});
export type Flow = z.infer<typeof flowSchema>;

/**
 * The SDD-DE mandatory cycle (from @royvillasana/sdd-de docs/sdd-mandatory-steps.md).
 * The app drives these exact steps via the installed skills (`/enrich-brief`,
 * `/generate-artifacts`, `/visual-verify`, `/sync-tokens`, `/commit`) — it never
 * invents methodology. Skill invocation works in headless `-p` mode.
 */
export const DEFAULT_FLOW: StageDef[] = [
  {
    id: "brief",
    title: "Brief",
    summary:
      "Provide the design brief, Figma frame URL, or user story that starts this cycle.",
    kind: "intake",
    gated: false,
  },
  {
    id: "enrich",
    title: "Enrich",
    summary:
      "/enrich-brief — turn the brief into an implementation-ready spec story with acceptance criteria.",
    kind: "agent",
    gated: true,
    artifactGlob: "enriched-story.md",
    promptTemplate:
      "/enrich-brief\n\nRead the brief in .sdd-de/brief.md and .sdd-de/project.yaml, then run the enrich-brief skill to produce the enriched spec story.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "specify",
    title: "Specify",
    summary:
      "/generate-artifacts — generate the component, interaction, and page specs from the enriched story.",
    kind: "agent",
    gated: true,
    artifactGlob: "-component-spec.md",
    promptTemplate:
      "/generate-artifacts\n\nRun the generate-artifacts skill to produce the component, interaction, and page/feature specs under specs/ from the approved enriched story.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "apply",
    title: "Apply",
    summary:
      "Create a feature branch and implement the spec one task at a time, tokens only — no hardcoded values.",
    kind: "agent",
    gated: false,
    promptTemplate:
      "First create a feature branch (feature/[component]-spec). Then read the component spec under specs/ and implement it one task at a time, using only design tokens from the token file. Mark each task complete in the spec as you go.",
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  {
    id: "visual-verify",
    title: "Visual verify",
    summary:
      "/visual-verify — compare the implementation to the spec across viewports; a11y audit; list discrepancies.",
    kind: "verify",
    gated: true,
    promptTemplate:
      "/visual-verify\n\nRun the visual-verify skill: compare the live implementation to the spec across 375/768/1440px, check every token, variant, and state, run the accessibility audit, and report discrepancies.",
    allowedTools: ["Read", "Bash"],
  },
  {
    id: "sync",
    title: "Sync",
    summary:
      "/sync-tokens — reconcile design.md and token files with the decisions made during implementation.",
    kind: "agent",
    gated: false,
    promptTemplate:
      "/sync-tokens\n\nRun the sync-tokens skill: update design.md and token files so they reflect the implementation. No undocumented deviations.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "commit",
    title: "Commit",
    summary: "/commit — open a PR where the spec is the PR description.",
    kind: "agent",
    gated: false,
    promptTemplate:
      "/commit\n\nRun the commit skill: commit the changes and open a PR whose description is the component spec, with the Figma link and QA screenshots. No direct pushes to main.",
    allowedTools: ["Read", "Bash"],
  },
];
