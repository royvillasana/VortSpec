import { z } from "zod";

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
});
export type InspectorToken = z.infer<typeof inspectorTokenSchema>;

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
});
export type InspectorComponent = z.infer<typeof inspectorComponentSchema>;

export const inspectorComponentsResultSchema = z.object({
  componentDir: z.string().nullable(),
  /** The dev-server URL to embed for live preview, if one is configured/known. */
  previewUrl: z.string().nullable(),
  components: z.array(inspectorComponentSchema),
});
export type InspectorComponentsResult = z.infer<typeof inspectorComponentsResultSchema>;
