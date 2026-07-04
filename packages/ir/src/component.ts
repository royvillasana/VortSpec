import { z } from "zod";
import { IdSchema, ProvenanceSchema } from "./primitives.js";
import type { IRPatch } from "./patches.js";
import {
  StylePropertySchema,
  StyleValueSchema,
  LayoutSpecSchema,
  TextSpecSchema,
  IRNodeSchema,
} from "./nodes.js";

// ---------- Component status ----------
export const ComponentStatusSchema = z.enum([
  "imported",
  "normalized",
  "approved",
  "validated",
]);
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>;

// ---------- Props ----------
export const PropTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "enum",
  "node",
]);
export type PropType = z.infer<typeof PropTypeSchema>;

export const ControlHintSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text") }),
  z.object({ kind: z.literal("toggle") }),
  z.object({ kind: z.literal("select") }),
  z.object({
    kind: z.literal("slider"),
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
  }),
  z.object({ kind: z.literal("slot-picker") }),
]);
export type ControlHint = z.infer<typeof ControlHintSchema>;

export const PropDefSchema = z.object({
  name: z.string(),
  type: PropTypeSchema,
  enumValues: z.array(z.string()).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  required: z.boolean(),
  description: z.string().optional(),
  control: ControlHintSchema.optional(),
  provenance: ProvenanceSchema,
});
export type PropDef = z.infer<typeof PropDefSchema>;

// ---------- Slots ----------
export const SlotDefSchema = z.object({
  name: z.string(),
  allowedComponents: z.array(IdSchema).optional(),
  maxItems: z.number().optional(),
  provenance: ProvenanceSchema,
});
export type SlotDef = z.infer<typeof SlotDefSchema>;

// ---------- Variants ----------
export const VariantAxisSchema = z.object({
  name: z.string(),
  options: z.array(z.string()),
  default: z.string(),
  provenance: ProvenanceSchema,
});
export type VariantAxis = z.infer<typeof VariantAxisSchema>;

// Node override shape used by VariantOverride and InteractionState
export const NodeOverrideSchema = z.object({
  nodePath: z.string(),
  styles: z.record(StylePropertySchema, StyleValueSchema).optional(),
  layout: LayoutSpecSchema.partial().optional(),
  visible: z.boolean().optional(),
  text: TextSpecSchema.partial().optional(),
});
export type NodeOverride = z.infer<typeof NodeOverrideSchema>;

export const VariantOverrideSchema = z.object({
  selector: z.record(z.string(), z.string()),
  nodeOverrides: z.array(NodeOverrideSchema),
});
export type VariantOverride = z.infer<typeof VariantOverrideSchema>;

// ---------- Interaction states ----------
export const InteractionStateSchema = z.object({
  name: z.enum(["hover", "focus", "active", "disabled", "loading", "error"]),
  nodeOverrides: z.array(NodeOverrideSchema),
  provenance: ProvenanceSchema,
});
export type InteractionState = z.infer<typeof InteractionStateSchema>;

// ---------- Accessibility ----------
export const A11yMetaSchema = z.object({
  role: z.string().optional(),
  focusable: z.boolean().optional(),
  labelStrategy: z
    .enum(["text-content", "aria-label-prop", "labelled-by-slot"])
    .optional(),
  notes: z.array(z.string()).optional(),
  contrastIssues: z
    .array(
      z.object({
        nodePath: z.string(),
        foregroundRef: IdSchema,
        backgroundRef: IdSchema,
        ratio: z.number(),
      }),
    )
    .optional(),
});
export type A11yMeta = z.infer<typeof A11yMetaSchema>;

// ---------- Completeness ----------
export const CompletenessIssueSchema: z.ZodType<CompletenessIssue> = z.lazy(
  () =>
    z.object({
      id: IdSchema,
      severity: z.enum(["error", "warning", "info"]),
      kind: z.enum([
        "flagged-literal",
        "unconfirmed-inference",
        "token-conflict",
        "near-duplicate-tokens",
        "unused-token",
        "missing-state",
        "contrast-failure",
        "unnamed-node",
      ]),
      message: z.string(),
      targets: z.array(
        z.object({
          componentId: IdSchema.optional(),
          tokenId: IdSchema.optional(),
          nodePath: z.string().optional(),
        }),
      ),
      // Circular dependency: CompletenessIssue -> IRPatch -> DesignToken.
      // We break it with z.any() at the Zod level; the TypeScript type
      // annotation on CompletenessIssue still enforces IRPatch structurally.
      suggestedAction: (z.any() as z.ZodType<IRPatch>).optional(),
    }),
);

export type CompletenessIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  kind:
    | "flagged-literal"
    | "unconfirmed-inference"
    | "token-conflict"
    | "near-duplicate-tokens"
    | "unused-token"
    | "missing-state"
    | "contrast-failure"
    | "unnamed-node";
  message: string;
  targets: Array<{
    componentId?: string;
    tokenId?: string;
    nodePath?: string;
  }>;
  suggestedAction?: IRPatch;
};

export const CompletenessReportSchema = z.object({
  score: z.number().min(0).max(100),
  computedAt: z.string(),
  metrics: z.object({
    tokenizedStyleRatio: z.number(),
    confirmedTokenRatio: z.number(),
    variantAxesConfirmed: z.number(),
    statesCovered: z.number(),
    namedNodesRatio: z.number(),
    a11yChecksPassed: z.number(),
  }),
  issues: z.array(CompletenessIssueSchema),
});
export type CompletenessReport = z.infer<typeof CompletenessReportSchema>;

// ---------- ComponentIR ----------
export const ComponentIRSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  status: ComponentStatusSchema,
  provenance: ProvenanceSchema,
  version: z.number(),
  variantAxes: z.array(VariantAxisSchema),
  props: z.array(PropDefSchema),
  slots: z.array(SlotDefSchema),
  states: z.array(InteractionStateSchema),
  structure: IRNodeSchema,
  variantOverrides: z.array(VariantOverrideSchema),
  a11y: A11yMetaSchema,
  completeness: CompletenessReportSchema,
});
export type ComponentIR = z.infer<typeof ComponentIRSchema>;
