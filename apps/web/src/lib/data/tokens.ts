import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DesignToken, TokenKind, Provenance } from "@/types/ir";

/**
 * Map IR TokenType → UI TokenKind
 */
function mapTokenType(type: string): TokenKind {
  switch (type) {
    case "color": return "color";
    case "typography": return "typography";
    case "spacing":
    case "sizing": return "spacing";
    case "radius": return "radius";
    case "shadow": return "shadow";
    default: return "other";
  }
}

/**
 * Flatten IR TokenValue → display string
 */
function flattenValue(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const v = value as Record<string, unknown>;
  const inner = v.value;
  if (!inner) return JSON.stringify(value);

  if (typeof inner === "number") return String(inner);
  if (typeof inner === "string") return inner;
  if (typeof inner === "object" && inner !== null) {
    const obj = inner as Record<string, unknown>;
    // ColorValue: { hex: "#2563EB", alpha?: number }
    if ("hex" in obj) return String(obj.hex);
    // DimensionValue: { value: number, unit: string }
    if ("value" in obj && "unit" in obj) return `${obj.value}${obj.unit}`;
    // TypographyValue
    if ("fontFamily" in obj) {
      const fontSize = obj.fontSize as Record<string, unknown> | undefined;
      return `${obj.fontFamily} ${fontSize?.value ?? ""}${fontSize?.unit ?? ""}`;
    }
    // ShadowValue: { layers: [...] }
    if ("layers" in obj) return `${(obj.layers as unknown[]).length} layer(s)`;
    // BorderValue
    if ("width" in obj && "style" in obj) {
      const w = obj.width as Record<string, unknown>;
      return `${w?.value ?? ""}${w?.unit ?? ""} ${obj.style}`;
    }
    // MotionValue
    if ("duration" in obj) return `${obj.duration}ms ${obj.easing ?? ""}`;
  }
  return JSON.stringify(inner);
}

/**
 * Resolve a display value (for color tokens, return the hex)
 */
function resolveValue(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const v = value as Record<string, unknown>;
  const inner = v.value;
  if (typeof inner === "number") return String(inner);
  if (typeof inner === "string") return inner;
  if (typeof inner === "object" && inner !== null) {
    const obj = inner as Record<string, unknown>;
    if ("hex" in obj) return String(obj.hex);
    if ("value" in obj && "unit" in obj) return `${obj.value}${obj.unit}`;
  }
  return flattenValue(value);
}

/**
 * Adapt IR Provenance → UI Provenance
 */
function adaptProvenance(prov: Record<string, unknown>): Provenance {
  return {
    confidence: (prov.confidence as "confirmed" | "inferred" | "pending") ?? "pending",
    source: String(prov.source ?? prov.sourceRef ?? "unknown"),
    extractor: String(prov.extractor ?? ""),
    importedAt: String(prov.extractedAt ?? prov.importedAt ?? new Date().toISOString()),
  };
}

/**
 * Fetch all tokens for a project, adapted to the UI shape.
 */
export async function getTokensForProject(projectId: string): Promise<DesignToken[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tokens")
    .select("id, doc, deprecated")
    .eq("project_id", projectId);

  if (error) throw new Error(`Failed to fetch tokens: ${error.message}`);
  if (!data) return [];

  return data.map((row) => {
    const doc = row.doc as Record<string, unknown>;
    return {
      id: String(doc.id ?? row.id),
      name: String(doc.name ?? "untitled"),
      kind: mapTokenType(String(doc.type ?? "")),
      value: flattenValue(doc.value),
      resolvedValue: resolveValue(doc.value),
      alias: doc.aliasOf ? String(doc.aliasOf) : undefined,
      provenance: adaptProvenance((doc.provenance ?? {}) as Record<string, unknown>),
      usageCount: 0, // TODO: compute from component bindings
      deprecated: Boolean(row.deprecated ?? doc.deprecated ?? false),
    };
  });
}
