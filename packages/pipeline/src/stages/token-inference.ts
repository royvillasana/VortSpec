import { llmJSON, logUsage } from "@vortspec/llm";
import { z } from "zod";
import type { StyleGroup } from "./style-mining";
import { generateId } from "../lib/id";

// Zod schema for LLM response
const TokenNamingResponseSchema = z.object({
  tokens: z.array(z.object({
    originalProperty: z.string(),
    originalValue: z.string(),
    name: z.string(),         // semantic name: color/primary/500
    role: z.string(),         // primary, secondary, neutral, accent, semantic, surface, border
    group: z.string(),        // color, typography, spacing, radius, shadow
    nearDuplicateOf: z.string().optional(), // value of a near-duplicate, if any
  }))
});

type TokenNamingResponse = z.infer<typeof TokenNamingResponseSchema>;

const SYSTEM_PROMPT = `You are a design token naming expert. Given a list of CSS property-value pairs with usage counts, assign semantic design-system names.

Naming convention: category/role/scale
- Colors: color/primary/500, color/neutral/900, color/surface/base, color/accent/default, color/success, color/error
- Typography: type/heading/xl, type/body/md, type/label, type/caption
- Spacing: spacing/xs, spacing/sm, spacing/md, spacing/lg, spacing/xl, spacing/2xl
- Radius: radius/sm, radius/md, radius/lg, radius/full
- Shadow: shadow/sm, shadow/md, shadow/lg
- Border: border/default, border/strong
- Opacity: opacity/disabled, opacity/overlay

Rules:
- Group similar colors by role (primary, secondary, neutral, accent, semantic)
- If two colors are very similar (e.g. #6B7280 and #71717A), mark one as nearDuplicateOf the other
- Font-related values group under typography
- Padding/margin/gap values group under spacing
- All names must be lowercase with / separators
- Return valid JSON only, no explanation`;

export interface TokenInferenceResult {
  namedTokens: Array<{
    property: string;
    value: string;
    name: string;
    role: string;
    group: string;
    nearDuplicateOf?: string;
  }>;
  nearDuplicates: Array<{ value1: string; value2: string; suggestedMerge: string }>;
  model: string;
  tokensUsed: number;
}

export async function runTokenInferenceCore(
  styleGroups: StyleGroup[],
  options?: { projectId?: string },
): Promise<TokenInferenceResult> {
  // Only send groups with usageCount >= 2 (promotion threshold)
  const candidates = styleGroups.filter(g => g.usageCount >= 2);

  if (candidates.length === 0) {
    return { namedTokens: [], nearDuplicates: [], model: "none", tokensUsed: 0 };
  }

  // Build compact input for LLM
  const input = candidates.map(g => ({
    property: g.property,
    value: g.value,
    usageCount: g.usageCount,
  }));

  const userPrompt = `Name these ${input.length} design token candidates:\n\n${JSON.stringify(input, null, 2)}\n\nReturn JSON: { "tokens": [{ "originalProperty": "...", "originalValue": "...", "name": "...", "role": "...", "group": "...", "nearDuplicateOf": "..." }] }`;

  try {
    const result = await llmJSON(
      SYSTEM_PROMPT,
      userPrompt,
      (data) => TokenNamingResponseSchema.parse(data),
      { temperature: 0, maxTokens: 4096, projectId: options?.projectId, purpose: "token-inference" },
    );

    // Extract near-duplicates
    const nearDuplicates: Array<{ value1: string; value2: string; suggestedMerge: string }> = [];
    for (const t of result.data.tokens) {
      if (t.nearDuplicateOf) {
        nearDuplicates.push({
          value1: t.originalValue,
          value2: t.nearDuplicateOf,
          suggestedMerge: t.name,
        });
      }
    }

    return {
      namedTokens: result.data.tokens.map(t => ({
        property: t.originalProperty,
        value: t.originalValue,
        name: t.name,
        role: t.role,
        group: t.group,
        nearDuplicateOf: t.nearDuplicateOf,
      })),
      nearDuplicates,
      model: result.model,
      tokensUsed: result.tokensIn + result.tokensOut,
    };
  } catch (err) {
    console.warn("[token-inference] LLM failed, using deterministic fallback:", err);
    // Deterministic fallback: property/value naming
    return {
      namedTokens: candidates.map(g => ({
        property: g.property,
        value: g.value,
        name: deterministicName(g.property, g.value),
        role: "unknown",
        group: propertyToGroup(g.property),
        nearDuplicateOf: undefined,
      })),
      nearDuplicates: [],
      model: "deterministic-fallback",
      tokensUsed: 0,
    };
  }
}

function deterministicName(property: string, value: string): string {
  const group = propertyToGroup(property);
  const sanitized = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
  return `${group}/${sanitized}`;
}

function propertyToGroup(property: string): string {
  if (property.includes("color") || property === "background" || property === "background-color") return "color";
  if (property.includes("font") || property === "line-height" || property === "letter-spacing") return "type";
  if (property.includes("padding") || property.includes("margin") || property === "gap") return "spacing";
  if (property.includes("radius")) return "radius";
  if (property.includes("shadow")) return "shadow";
  if (property.includes("border")) return "border";
  if (property === "opacity") return "opacity";
  return "other";
}
