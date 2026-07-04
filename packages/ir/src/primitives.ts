import { z } from "zod";

// All IDs are prefixed nanoid strings: tok_..., cmp_..., nod_..., etc.
export const IdSchema = z.string();
export type Id = z.infer<typeof IdSchema>;

export const SourceKindSchema = z.enum([
  "figma",
  "zip-html",
  "stitch-mcp",
  "native",
  "user",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const ConfidenceSchema = z.enum(["confirmed", "inferred", "pending"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ProvenanceSchema = z.object({
  source: SourceKindSchema,
  sourceRef: z.string().optional(),
  extractor: z.string(),
  extractedAt: z.string(), // ISO 8601
  confidence: ConfidenceSchema,
  confirmedBy: z.enum(["user", "rule"]).optional(),
  inferredBy: z.enum(["deterministic", "llm"]).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;
