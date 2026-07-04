import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ComponentSummary {
  id: string;
  name: string;
  variants: number;
  score: number;
  status: "imported" | "normalized" | "approved";
  preview: string;
}

export interface ComponentDetailData {
  id: string;
  name: string;
  slug: string;
  status: "imported" | "normalized" | "approved";
  version: number;
  variantAxes: Array<{
    name: string;
    options: string[];
    confidence: "confirmed" | "inferred" | "pending";
  }>;
  props: Array<{
    name: string;
    type: string;
    default: string;
    provenance: "confirmed" | "inferred" | "pending";
  }>;
  states: Array<{
    name: string;
    provenance: "confirmed" | "inferred" | "pending";
  }>;
  structure: Array<{
    depth: number;
    tag: string;
    name: string;
    flagged: boolean;
    literalValue?: string;
  }>;
  tokenBindings: Array<{
    id: string;
    name: string;
    value: string;
    kind: string;
    property: string;
    editable: boolean;
  }>;
  issues: Array<{
    id: string;
    text: string;
    severity: "error" | "warning" | "info";
    action: string;
  }>;
  score: number;
  rawStructure: Record<string, unknown>;
  description?: string;
}

/**
 * Fetch all components for a project as summaries for the grid view.
 */
export async function getComponentsForProject(projectId: string): Promise<ComponentSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("components")
    .select("id, doc, status")
    .eq("project_id", projectId);

  if (error) throw new Error(`Failed to fetch components: ${error.message}`);
  if (!data) return [];

  return data.map((row) => {
    const doc = row.doc as Record<string, unknown>;
    const axes = (doc.variantAxes ?? []) as Array<{ options?: string[] }>;
    const completeness = (doc.completeness ?? {}) as Record<string, unknown>;
    const variantCount = axes.reduce((sum, a) => sum + (a.options?.length ?? 0), 0);

    return {
      id: row.id,
      name: String(doc.name ?? "Untitled"),
      variants: variantCount,
      score: Number(completeness.score ?? 0),
      status: (row.status ?? "imported") as "imported" | "normalized" | "approved",
      preview: String(doc.slug ?? doc.name ?? "component").toLowerCase().replace(/[^a-z]/g, ""),
    };
  });
}

/**
 * Flatten an IRNode tree into a flat list with depth info.
 */
function flattenStructure(
  node: Record<string, unknown>,
  depth: number,
): Array<{ depth: number; tag: string; name: string; flagged: boolean; literalValue?: string }> {
  const results: Array<{ depth: number; tag: string; name: string; flagged: boolean; literalValue?: string }> = [];

  const styles = (node.styles ?? {}) as Record<string, Record<string, unknown>>;
  let flagged = false;
  let literalValue: string | undefined;
  for (const sv of Object.values(styles)) {
    if (sv?.kind === "literal" && sv?.flagged === true) {
      flagged = true;
      literalValue = String(sv.value ?? "");
      break;
    }
  }

  results.push({
    depth,
    tag: String(node.type ?? "frame"),
    name: String(node.name ?? "unnamed"),
    flagged,
    literalValue,
  });

  const children = (node.children ?? []) as Array<Record<string, unknown>>;
  for (const child of children) {
    results.push(...flattenStructure(child, depth + 1));
  }

  return results;
}

/**
 * Fetch a single component's full detail.
 */
export async function getComponentDetail(
  projectId: string,
  componentId: string,
): Promise<ComponentDetailData | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("components")
    .select("id, doc, status, version")
    .eq("project_id", projectId)
    .eq("id", componentId)
    .single();

  if (error || !data) return null;

  const doc = data.doc as Record<string, unknown>;
  const axes = (doc.variantAxes ?? []) as Array<Record<string, unknown>>;
  const props = (doc.props ?? []) as Array<Record<string, unknown>>;
  const states = (doc.states ?? []) as Array<Record<string, unknown>>;
  const structure = (doc.structure ?? {}) as Record<string, unknown>;
  const completeness = (doc.completeness ?? {}) as Record<string, unknown>;
  const issues = ((completeness.issues ?? []) as Array<Record<string, unknown>>);

  return {
    id: data.id,
    name: String(doc.name ?? "Untitled"),
    slug: String(doc.slug ?? ""),
    status: (data.status ?? "imported") as "imported" | "normalized" | "approved",
    version: data.version ?? 1,
    variantAxes: axes.map((a) => ({
      name: String(a.name ?? ""),
      options: (a.options ?? []) as string[],
      confidence: ((a.provenance as Record<string, unknown>)?.confidence ?? "pending") as "confirmed" | "inferred" | "pending",
    })),
    props: props.map((p) => ({
      name: String(p.name ?? ""),
      type: String(p.type ?? "string"),
      default: String(p.default ?? "—"),
      provenance: ((p.provenance as Record<string, unknown>)?.confidence ?? "pending") as "confirmed" | "inferred" | "pending",
    })),
    states: states.map((s) => ({
      name: String(s.name ?? ""),
      provenance: ((s.provenance as Record<string, unknown>)?.confidence ?? "pending") as "confirmed" | "inferred" | "pending",
    })),
    structure: flattenStructure(structure, 0),
    tokenBindings: [], // TODO: extract from structure styles that reference tokens
    issues: issues.map((i) => ({
      id: String(i.id ?? ""),
      text: String(i.message ?? ""),
      severity: (i.severity ?? "info") as "error" | "warning" | "info",
      action: i.suggestedAction ? "Fix" : "Review",
    })),
    score: Number(completeness.score ?? 0),
    rawStructure: structure,
    description: doc.description ? String(doc.description) : undefined,
  };
}
