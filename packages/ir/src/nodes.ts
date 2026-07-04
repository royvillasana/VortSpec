import { z } from "zod";
import { IdSchema, ProvenanceSchema } from "./primitives.js";

// ---------- Node type ----------
export const NodeTypeSchema = z.enum([
  "frame",
  "text",
  "icon",
  "image",
  "instance",
  "slot",
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

// ---------- Style property ----------
export const StylePropertySchema = z.enum([
  "background",
  "color",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "radius",
  "shadow",
  "opacity",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "typography",
  "zIndex",
  "motion",
  "overflow",
]);
export type StyleProperty = z.infer<typeof StylePropertySchema>;

// ---------- StyleValue: THE core invariant ----------
// A style value is either a token reference or an explicitly flagged literal.
// Flagged literals are debt made visible. There is no third option.
export const StyleValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("token"), tokenId: IdSchema }),
  z.object({
    kind: z.literal("literal"),
    value: z.union([z.string(), z.number()]),
    flagged: z.literal(true),
  }),
]);
export type StyleValue = z.infer<typeof StyleValueSchema>;

// ---------- LayoutSpec ----------
export const LayoutSpecSchema = z.object({
  mode: z.enum(["flex", "grid", "none"]),
  direction: z.enum(["row", "column"]).optional(),
  gap: StyleValueSchema.optional(),
  padding: z
    .object({
      top: StyleValueSchema,
      right: StyleValueSchema,
      bottom: StyleValueSchema,
      left: StyleValueSchema,
    })
    .optional(),
  align: z.enum(["start", "center", "end", "stretch", "baseline"]).optional(),
  justify: z.enum(["start", "center", "end", "between", "around"]).optional(),
  wrap: z.boolean().optional(),
  // grid-only:
  columns: z.number().optional(),
  rows: z.number().optional(),
});
export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;

// ---------- TextSpec ----------
export const TextSpecSchema = z.object({
  content: z.string().optional(),
  bindToProp: z.string().optional(),
  typographyRef: StyleValueSchema.optional(),
});
export type TextSpec = z.infer<typeof TextSpecSchema>;

// ---------- IRNode (recursive via z.lazy) ----------
export const IRNodeSchema: z.ZodType<IRNode> = z.lazy(() =>
  z.object({
    id: IdSchema,
    type: NodeTypeSchema,
    name: z.string(),
    layout: LayoutSpecSchema.optional(),
    styles: z.record(StylePropertySchema, StyleValueSchema).optional(),
    text: TextSpecSchema.optional(),
    slotName: z.string().optional(),
    instance: z
      .object({
        componentId: IdSchema,
        variantSelection: z.record(z.string(), z.string()),
        propBindings: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ),
      })
      .optional(),
    children: z.array(IRNodeSchema).optional(),
    provenance: ProvenanceSchema,
  }),
);

export type IRNode = {
  id: string;
  type: z.infer<typeof NodeTypeSchema>;
  name: string;
  layout?: z.infer<typeof LayoutSpecSchema>;
  styles?: Partial<Record<StyleProperty, StyleValue>>;
  text?: z.infer<typeof TextSpecSchema>;
  slotName?: string;
  instance?: {
    componentId: string;
    variantSelection: Record<string, string>;
    propBindings: Record<string, string | number | boolean>;
  };
  children?: IRNode[];
  provenance: z.infer<typeof ProvenanceSchema>;
};
