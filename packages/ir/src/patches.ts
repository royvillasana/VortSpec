import { z } from "zod";
import { IdSchema } from "./primitives.js";
import { DesignTokenSchema } from "./tokens.js";
import { ComponentStatusSchema } from "./component.js";
import {
  StylePropertySchema,
  StyleValueSchema,
  LayoutSpecSchema,
  TextSpecSchema,
} from "./nodes.js";

// ---------- PatchOp: discriminated union on `op` ----------
export const PatchOpSchema = z.discriminatedUnion("op", [
  // token ops
  z.object({
    op: z.literal("token.create"),
    token: DesignTokenSchema,
  }),
  z.object({
    op: z.literal("token.update"),
    tokenId: IdSchema,
    changes: DesignTokenSchema.pick({
      name: true,
      value: true,
      description: true,
      aliasOf: true,
    }).partial(),
  }),
  z.object({
    op: z.literal("token.merge"),
    sourceTokenIds: z.array(IdSchema),
    targetTokenId: IdSchema,
  }),
  z.object({
    op: z.literal("token.delete"),
    tokenId: IdSchema,
    fallback: z.union([
      z.literal("inline-literal"),
      z.object({ replacementTokenId: IdSchema }),
    ]),
  }),
  z.object({
    op: z.literal("token.promoteLiteral"),
    componentId: IdSchema,
    nodePath: z.string(),
    property: z.string(),
    newToken: DesignTokenSchema,
  }),
  // component ops
  z.object({
    op: z.literal("component.rename"),
    componentId: IdSchema,
    name: z.string(),
  }),
  z.object({
    op: z.literal("component.setStatus"),
    componentId: IdSchema,
    status: ComponentStatusSchema,
  }),
  z.object({
    op: z.literal("component.updateNode"),
    componentId: IdSchema,
    nodePath: z.string(),
    changes: z
      .object({
        name: z.string(),
        styles: z.record(StylePropertySchema, StyleValueSchema),
        layout: LayoutSpecSchema.partial(),
        text: TextSpecSchema.partial(),
      })
      .partial(),
  }),
  z.object({
    op: z.literal("component.axis.update"),
    componentId: IdSchema,
    axisName: z.string(),
    changes: z
      .object({
        name: z.string(),
        options: z.array(z.string()),
        default: z.string(),
      })
      .partial(),
  }),
  z.object({
    op: z.literal("component.axis.confirm"),
    componentId: IdSchema,
    axisName: z.string(),
  }),
  z.object({
    op: z.literal("component.prop.update"),
    componentId: IdSchema,
    propName: z.string(),
    changes: z
      .object({
        name: z.string(),
        type: z.enum(["string", "number", "boolean", "enum", "node"]),
        enumValues: z.array(z.string()),
        default: z.union([z.string(), z.number(), z.boolean()]),
        required: z.boolean(),
        description: z.string(),
      })
      .partial(),
  }),
  z.object({
    op: z.literal("component.discard"),
    componentId: IdSchema,
  }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

// ---------- IRPatch ----------
export const IRPatchSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  ops: z.array(PatchOpSchema),
  summary: z.string(),
  generatedBy: z.enum(["user", "llm"]),
  status: z.enum(["proposed", "applied", "rejected"]),
  createdAt: z.string(),
  appliedAt: z.string().optional(),
  baseVersion: z.number(),
});
export type IRPatch = z.infer<typeof IRPatchSchema>;
