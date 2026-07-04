import { z } from "zod";
import { IdSchema, ProvenanceSchema } from "./primitives.js";

// ---------- Token type ----------
export const TokenTypeSchema = z.enum([
  "color",
  "typography",
  "spacing",
  "sizing",
  "radius",
  "border",
  "shadow",
  "opacity",
  "zIndex",
  "motion",
]);
export type TokenType = z.infer<typeof TokenTypeSchema>;

// ---------- Typed values ----------
export const ColorValueSchema = z.object({
  hex: z.string(),
  alpha: z.number().optional(),
});
export type ColorValue = z.infer<typeof ColorValueSchema>;

export const DimensionValueSchema = z.object({
  value: z.number(),
  unit: z.enum(["px", "rem", "%"]),
});
export type DimensionValue = z.infer<typeof DimensionValueSchema>;

export const TypographyValueSchema = z.object({
  fontFamily: z.string(),
  fontSize: DimensionValueSchema,
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.union([DimensionValueSchema, z.number()]),
  letterSpacing: DimensionValueSchema.optional(),
  textTransform: z
    .enum(["none", "uppercase", "lowercase", "capitalize"])
    .optional(),
});
export type TypographyValue = z.infer<typeof TypographyValueSchema>;

export const ShadowLayerSchema = z.object({
  x: z.number(),
  y: z.number(),
  blur: z.number(),
  spread: z.number(),
  colorRef: z.union([IdSchema, ColorValueSchema]),
  inset: z.boolean().optional(),
});
export type ShadowLayer = z.infer<typeof ShadowLayerSchema>;

export const ShadowValueSchema = z.object({
  layers: z.array(ShadowLayerSchema),
});
export type ShadowValue = z.infer<typeof ShadowValueSchema>;

export const BorderValueSchema = z.object({
  width: DimensionValueSchema,
  style: z.enum(["solid", "dashed", "dotted"]),
  colorRef: IdSchema,
});
export type BorderValue = z.infer<typeof BorderValueSchema>;

export const MotionValueSchema = z.object({
  duration: z.number(), // ms
  easing: z.string(), // cubic-bezier or keyword
});
export type MotionValue = z.infer<typeof MotionValueSchema>;

// ---------- Discriminated union on `type` ----------
export const TokenValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: ColorValueSchema }),
  z.object({ type: z.literal("typography"), value: TypographyValueSchema }),
  z.object({ type: z.literal("spacing"), value: DimensionValueSchema }),
  z.object({ type: z.literal("sizing"), value: DimensionValueSchema }),
  z.object({ type: z.literal("radius"), value: DimensionValueSchema }),
  z.object({ type: z.literal("border"), value: BorderValueSchema }),
  z.object({ type: z.literal("shadow"), value: ShadowValueSchema }),
  z.object({ type: z.literal("opacity"), value: z.number() }),
  z.object({ type: z.literal("zIndex"), value: z.number() }),
  z.object({ type: z.literal("motion"), value: MotionValueSchema }),
]);
export type TokenValue = z.infer<typeof TokenValueSchema>;

// ---------- DesignToken ----------
export const DesignTokenSchema = z.object({
  id: IdSchema,
  name: z.string(),
  type: TokenTypeSchema,
  value: TokenValueSchema,
  aliasOf: IdSchema.optional(),
  description: z.string().optional(),
  deprecated: z.boolean().optional(),
  provenance: ProvenanceSchema,
});
export type DesignToken = z.infer<typeof DesignTokenSchema>;

// ---------- TokenUsage (computed, never stored on token) ----------
export const TokenUsageSchema = z.object({
  tokenId: IdSchema,
  count: z.number(),
  refs: z.array(
    z.object({
      componentId: IdSchema,
      nodePath: z.string(),
      property: z.string(),
    }),
  ),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// ---------- Theme (phase 5, schema reserved now) ----------
export const ThemeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  overrides: z.record(IdSchema, TokenValueSchema),
});
export type Theme = z.infer<typeof ThemeSchema>;
