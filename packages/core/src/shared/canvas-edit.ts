import { z } from "zod";
import { fileSnapshotListSchema } from "./inspector";

/**
 * Wire schemas for a deterministic canvas edit (change: instant-playground-edits).
 * Shared so IPC validation and the main-process codemods agree on one shape.
 */

/** A `data-source` anchor: 1-based `line`, 0-based `column` (React `__source`). */
export const anchorSchema = z.object({ line: z.number(), column: z.number() });
export type Anchor = z.infer<typeof anchorSchema>;

/** A JSX attribute value: a plain string (`x="v"`) or a raw expression (`x={v}`). */
export const attrValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("string"), value: z.string() }),
  z.object({ kind: z.literal("expression"), value: z.string() }),
]);
export type AttrValue = z.infer<typeof attrValueSchema>;

/** One deterministic edit op the codemod layer can execute. `attr` covers prop/style/variant. */
export const canvasEditSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("attr"), anchor: anchorSchema, name: z.string(), value: attrValueSchema }),
  z.object({ op: z.literal("text"), anchor: anchorSchema, text: z.string() }),
  z.object({
    op: z.literal("insert"),
    anchor: anchorSchema,
    name: z.string(),
    importFrom: z.string().optional(),
    index: z.number().optional(),
  }),
  z.object({ op: z.literal("delete"), anchor: anchorSchema }),
  z.object({ op: z.literal("duplicate"), anchor: anchorSchema }),
  z.object({ op: z.literal("move"), anchor: anchorSchema, to: anchorSchema, index: z.number().optional() }),
]);
export type CanvasEdit = z.infer<typeof canvasEditSchema>;

export const canvasWriteResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  snapshot: fileSnapshotListSchema.optional(),
});
export type CanvasWriteResult = z.infer<typeof canvasWriteResultSchema>;
