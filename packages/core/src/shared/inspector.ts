import { z } from "zod";
import { figmaComponentSchema } from "./figma";

/**
 * Design System Inspector contracts (change: add-design-system-inspector).
 * Tokens are derived from the project's own files — the configured token file
 * (and, later, the authoritative Figma variables) — not from any IR store.
 * Zod validation lives only at this parse boundary.
 */

export const tokenTypeSchema = z.enum([
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "other",
]);
export type TokenType = z.infer<typeof tokenTypeSchema>;

/** Where a token's value came from — the v2 file-derived replacement for v1 IR provenance. */
export const tokenSourceSchema = z.enum([
  "figma-variable",
  "generated-code",
  "hand-edited",
]);
export type TokenSource = z.infer<typeof tokenSourceSchema>;

/** Whether a code token is in sync with its authoritative Figma variable. */
export const tokenDriftSchema = z.enum(["in-sync", "drifted"]);
export type TokenDrift = z.infer<typeof tokenDriftSchema>;

export const inspectorTokenSchema = z.object({
  /** CSS custom-property name without the leading `--` (e.g. `color-primary`). */
  name: z.string(),
  type: tokenTypeSchema,
  /** Raw value as written in the token file (may be a `var(--other)` reference). */
  rawValue: z.string(),
  /** Value with in-file `var(--x)` references resolved, for display/swatches. */
  resolvedValue: z.string(),
  source: tokenSourceSchema,
  /** How many component source references this token (best-effort var() scan). */
  uses: z.number(),
  /** The matched Figma variable's resolved value, when a Figma export is present. */
  figmaValue: z.string().optional(),
  /** In-sync/drifted vs the matched Figma variable; absent when unmatched/no export. */
  drift: tokenDriftSchema.optional(),
});
export type InspectorToken = z.infer<typeof inspectorTokenSchema>;

/** A design variable exported from Figma (via a scoped Claude Code run), the authoritative source. */
export const figmaVariableSchema = z.object({
  name: z.string(),
  resolvedValue: z.string(),
  type: tokenTypeSchema.optional(),
  collection: z.string().optional(),
});
export type FigmaVariable = z.infer<typeof figmaVariableSchema>;

/**
 * Code→Figma push (change: add-code-to-figma-token-push). A push plan is computed
 * locally by diffing the code token file against the Figma-variable cache; it is
 * what the user previews and confirms before any Figma write. VortSpec never
 * writes Figma directly — figma-cli or a scoped Claude Code run applies the plan.
 */

/** The scalar Figma variable type a code token maps to on push. */
export const figmaVariableTypeSchema = z.enum(["COLOR", "FLOAT", "STRING"]);
export type FigmaVariableType = z.infer<typeof figmaVariableTypeSchema>;

export const pushPlanEntrySchema = z.object({
  /** The Figma variable name to create/update (may be a composite sub-variable, e.g. `shadow-md-blur`). */
  variable: z.string(),
  /** create = no matching Figma variable yet; update = exists but drifted. */
  op: z.enum(["create", "update"]),
  /** Scalar Figma variable type to write. */
  figmaType: figmaVariableTypeSchema,
  /** Concrete value to set, when not an alias. */
  value: z.string().optional(),
  /** Normalized name of the Figma variable to alias to, when the code token is a `var(--x)` reference. */
  aliasTarget: z.string().optional(),
  /** The current Figma value being replaced (update only), for the preview. */
  currentFigmaValue: z.string().optional(),
  /** The source code token this entry derives from. */
  tokenName: z.string(),
  /** The source token's classified type (color/typography/…). */
  tokenType: tokenTypeSchema,
});
export type PushPlanEntry = z.infer<typeof pushPlanEntrySchema>;

export const pushPlanSchema = z.object({
  /** The Figma Variables collection the push targets (from `figma_token_collection`, default `Tokens`). */
  collection: z.string(),
  entries: z.array(pushPlanEntrySchema),
});
export type PushPlan = z.infer<typeof pushPlanSchema>;

export const figmaPushResultSchema = z.object({
  ok: z.boolean(),
  /** how many variables were created. */
  created: z.number(),
  /** how many variables were updated. */
  updated: z.number(),
  /** what applied the push, or null when no writer was available (→ MCP fallback / fix-it). */
  source: z.enum(["cli"]).nullable(),
  /** a human, next-step message. */
  message: z.string(),
});
export type FigmaPushResult = z.infer<typeof figmaPushResultSchema>;

/** One "where used" entry for the token detail drawer. */
export const tokenUsageSchema = z.object({
  component: z.string(),
  property: z.string().optional(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const inspectorTokensResultSchema = z.object({
  /** Project-relative path of the token file that was parsed, or null if none. */
  tokenFile: z.string().nullable(),
  tokens: z.array(inspectorTokenSchema),
  /** token name → components/props that reference it (for the detail drawer). */
  usage: z.record(z.string(), z.array(tokenUsageSchema)),
  /** Figma variables with no matching code token (present only after a Figma sync). */
  figmaOnly: z.array(figmaVariableSchema).default([]),
  /** Whether a `.vortspec/figma-variables.json` export was found and reconciled. */
  figmaSynced: z.boolean().default(false),
});
export type InspectorTokensResult = z.infer<typeof inspectorTokensResultSchema>;

// ── Components + Playground (Dev Preview screen) ─────────────────────

/** A prop control derived from the component's source (CVA variants / prop types). */
export const propControlSchema = z.object({
  key: z.string(),
  kind: z.enum(["enum", "boolean", "text"]),
  /** Options for an enum control. */
  options: z.array(z.string()).default([]),
  /** Default value from the component's defaultVariants, if any. */
  defaultValue: z.string().optional(),
  /** CVA classes per option (option → class string), for live variant preview + detection. */
  classes: z.record(z.string(), z.string()).default({}),
});
export type PropControl = z.infer<typeof propControlSchema>;

/** Validation status derived from the component's visual-verify report. */
export const componentStatusSchema = z.enum(["verified", "has-issues", "built", "unknown"]);
export type ComponentStatus = z.infer<typeof componentStatusSchema>;

export const inspectorComponentSchema = z.object({
  name: z.string(),
  level: z.enum(["atom", "molecule", "organism"]).optional(),
  description: z.string().optional(),
  /** Project-relative path of the component's source file, or null if not found. */
  file: z.string().nullable(),
  props: z.array(propControlSchema),
  /** Token names the component references (best-effort scan of its source). */
  tokens: z.array(z.string()),
  status: componentStatusSchema,
  /** Open issues from the visual-verify report, if any. */
  issues: z.array(z.string()),
  /** Project-relative path of the component's spec dir/file, if one exists. */
  specPath: z.string().nullable(),
  /** Project-relative path of the visual-verify report, if one exists. */
  reportPath: z.string().nullable(),
  /** Detected variant-set axes (e.g. ["type","size"]) — a collapsed COMPONENT_SET / variant family. */
  variants: z.array(z.string()).optional(),
  /** Whether a matching component exists in the connected Figma file (Wave 3). */
  figmaBacked: z.boolean().optional(),
  /** The matched Figma component's variant axes, when figma-backed. */
  figmaVariants: z.array(z.string()).optional(),
});
export type InspectorComponent = z.infer<typeof inspectorComponentSchema>;

export const inspectorComponentsResultSchema = z.object({
  componentDir: z.string().nullable(),
  /** The dev-server URL to embed for live preview, if one is configured/known. */
  previewUrl: z.string().nullable(),
  components: z.array(inspectorComponentSchema),
  /** Figma components with no matching code component — designed, not yet built (Wave 3). */
  figmaOnly: z.array(figmaComponentSchema).default([]),
  /** Whether a `.vortspec/figma-components.json` export was found and reconciled. */
  figmaSynced: z.boolean().default(false),
});
export type InspectorComponentsResult = z.infer<typeof inspectorComponentsResultSchema>;

/** A captured file (project-relative path + content), for gated revert of a modify run. */
export const fileSnapshotSchema = z.object({ path: z.string(), content: z.string() });
export type FileSnapshot = z.infer<typeof fileSnapshotSchema>;
export const fileSnapshotListSchema = z.array(fileSnapshotSchema);

// ── Verification (visual-verify + adversarial-review findings) ────────

export const findingSeveritySchema = z.enum(["error", "warning", "info"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const verificationFindingSchema = z.object({
  /** Stable id: `<component>:<raw id>` (e.g. `callout:D2`). */
  id: z.string(),
  /** Short raw id from the report (e.g. `D2`, `O-A`). */
  rawId: z.string(),
  component: z.string(),
  group: z.enum(["visual", "adversarial"]),
  severity: findingSeveritySchema,
  title: z.string(),
  detail: z.string(),
  /** A referenced file/token from the finding, if one was found. */
  ref: z.string().optional(),
  status: z.enum(["open", "resolved"]),
  /** Project-relative path of the report the finding came from. */
  reportPath: z.string(),
});
export type VerificationFinding = z.infer<typeof verificationFindingSchema>;

export const verificationResultSchema = z.object({
  findings: z.array(verificationFindingSchema),
});
export type VerificationResult = z.infer<typeof verificationResultSchema>;
