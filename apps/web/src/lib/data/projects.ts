import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  ai_mode: string;
  created_at: string;
}

export interface ProjectWithStats extends ProjectRow {
  token_count: number;
  component_count: number;
  approved_count: number;
  completeness_score: number | null;
  sources: string[];
  import_status: "idle" | "running" | "done" | "failed";
  import_stage?: number;
  import_total_stages?: number;
}

export async function getProjects(): Promise<ProjectWithStats[]> {
  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  if (!projects) return [];

  // Enrich with counts and import status
  const enriched: ProjectWithStats[] = [];
  for (const proj of projects) {
    const [
      { count: tokenCount },
      { count: componentCount },
      { count: approvedCount },
      { data: sources },
      { data: latestImport },
    ] = await Promise.all([
      supabase.from("tokens").select("*", { count: "exact", head: true }).eq("project_id", proj.id),
      supabase.from("components").select("*", { count: "exact", head: true }).eq("project_id", proj.id),
      supabase.from("components").select("*", { count: "exact", head: true }).eq("project_id", proj.id).eq("status", "approved"),
      supabase.from("sources").select("kind").eq("project_id", proj.id),
      supabase.from("imports").select("status, stage_states").eq("project_id", proj.id).order("created_at", { ascending: false }).limit(1),
    ]);

    const importRow = latestImport?.[0];
    let importStage: number | undefined;
    let importTotalStages: number | undefined;
    if (importRow?.status === "running" && importRow.stage_states) {
      const stages = importRow.stage_states as Record<string, { status: string }>;
      const stageNames = Object.keys(stages);
      importTotalStages = stageNames.length;
      importStage = stageNames.filter((k) => stages[k].status === "done").length;
    }

    enriched.push({
      ...proj,
      token_count: tokenCount ?? 0,
      component_count: componentCount ?? 0,
      approved_count: approvedCount ?? 0,
      completeness_score: null, // computed later from component docs
      sources: [...new Set((sources ?? []).map((s: { kind: string }) => s.kind))],
      import_status: (importRow?.status as "running" | "done" | "failed") ?? "idle",
      import_stage: importStage,
      import_total_stages: importTotalStages,
    });
  }

  return enriched;
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createProject(name: string): Promise<ProjectRow> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name })
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete project: ${error.message}`);
}
