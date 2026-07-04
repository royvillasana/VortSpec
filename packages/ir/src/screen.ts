import { z } from "zod";
import { IdSchema } from "./primitives.js";
import {
  StylePropertySchema,
  StyleValueSchema,
  LayoutSpecSchema,
  TextSpecSchema,
} from "./nodes.js";

// ---------- ScreenNode: discriminated union on `kind` ----------
export const ScreenNodeSchema: z.ZodType<ScreenNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("instance"),
      id: IdSchema,
      componentId: IdSchema,
      variantSelection: z.record(z.string(), z.string()),
      props: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean()]),
      ),
      slots: z.record(z.string(), z.array(ScreenNodeSchema)),
    }),
    z.object({
      kind: z.literal("layout"),
      id: IdSchema,
      name: z.string(),
      layout: LayoutSpecSchema,
      styles: z.record(StylePropertySchema, StyleValueSchema).optional(),
      children: z.array(ScreenNodeSchema),
    }),
    z.object({
      kind: z.literal("text"),
      id: IdSchema,
      text: TextSpecSchema,
    }),
  ]),
);

export type ScreenNode =
  | {
      kind: "instance";
      id: string;
      componentId: string;
      variantSelection: Record<string, string>;
      props: Record<string, string | number | boolean>;
      slots: Record<string, ScreenNode[]>;
    }
  | {
      kind: "layout";
      id: string;
      name: string;
      layout: z.infer<typeof LayoutSpecSchema>;
      styles?: Partial<
        Record<
          z.infer<typeof StylePropertySchema>,
          z.infer<typeof StyleValueSchema>
        >
      >;
      children: ScreenNode[];
    }
  | {
      kind: "text";
      id: string;
      text: z.infer<typeof TextSpecSchema>;
    };

// ---------- ScreenIR ----------
export const ScreenIRSchema = z.object({
  id: IdSchema,
  name: z.string(),
  version: z.number(),
  root: ScreenNodeSchema,
});
export type ScreenIR = z.infer<typeof ScreenIRSchema>;
