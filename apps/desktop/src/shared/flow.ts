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
  /** relative path of the artifact this stage produces, if any */
  artifact: z.string().optional(),
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
 * Default SDD-DE stage set. This mirrors the shape of the CLI's cycle; the exact
 * prompts/skill invocations are refined against the real toolkit (the app never
 * invents methodology — it drives the CLI's steps).
 */
export const DEFAULT_FLOW: StageDef[] = [
  {
    id: "design-input",
    title: "Design input",
    summary: "Provide the design source: a Figma link, a dropped export ZIP, or a folder.",
    kind: "input",
    gated: false,
  },
  {
    id: "intake",
    title: "Intake",
    summary: "Answer the initial discovery questions so the agent has product context.",
    kind: "intake",
    gated: false,
    artifact: "intake.md",
  },
  {
    id: "enrich-brief",
    title: "Enrich brief",
    summary: "The agent turns the intake and design into an enriched brief for review.",
    kind: "agent",
    gated: true,
    artifact: "brief.enriched.md",
    promptTemplate:
      "Run the SDD-DE enrich-brief step: read the intake answers and design input, and write an enriched brief.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "spec",
    title: "Spec",
    summary: "Generate the component/screen spec from the approved brief.",
    kind: "agent",
    gated: true,
    artifact: "spec.md",
    promptTemplate:
      "Run the SDD-DE spec step: from the approved enriched brief, produce a spec.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "plan",
    title: "Plan",
    summary: "Produce an implementation plan from the approved spec.",
    kind: "agent",
    gated: true,
    artifact: "plan.md",
    promptTemplate:
      "Run the SDD-DE plan step: from the approved spec, produce an implementation plan.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "implement",
    title: "Implement",
    summary: "Generate the component code into the project from the approved plan.",
    kind: "agent",
    gated: false,
    promptTemplate:
      "Run the SDD-DE implementation step: implement the approved plan as real code in this project.",
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  {
    id: "verify",
    title: "Verify",
    summary: "Run visual-verify and adversarial review; approve or send findings back.",
    kind: "verify",
    gated: false,
    promptTemplate:
      "Run the SDD-DE verification steps (visual-verify, adversarial review) and report findings.",
    allowedTools: ["Read", "Bash"],
  },
];
