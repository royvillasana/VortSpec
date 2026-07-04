import { createServerSupabaseClient } from "@/lib/supabase/server";

export const PIPELINE_STAGES = [
  "parse",
  "style_mining",
  "token_inference",
  "structure_inference",
  "ds_merge",
  "report",
] as const;

export type StageName = (typeof PIPELINE_STAGES)[number];

export interface StageState {
  status: "queued" | "running" | "done" | "failed";
  error?: string;
  result?: Record<string, unknown>;
}

export type StageStates = Record<StageName, StageState>;

export interface ImportRow {
  id: string;
  project_id: string;
  source_id: string;
  status: "running" | "done" | "failed";
  stage_states: StageStates;
  error: string | null;
  created_at: string;
}

function initialStageStates(): StageStates {
  return Object.fromEntries(
    PIPELINE_STAGES.map((name) => [name, { status: "queued" as const }]),
  ) as StageStates;
}

export async function createImport(
  projectId: string,
  sourceId: string,
): Promise<ImportRow> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("imports")
    .insert({
      project_id: projectId,
      source_id: sourceId,
      status: "running",
      stage_states: initialStageStates(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create import: ${error.message}`);
  return data;
}

export async function getImport(importId: string): Promise<ImportRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .eq("id", importId)
    .single();

  if (error) return null;
  return data;
}
