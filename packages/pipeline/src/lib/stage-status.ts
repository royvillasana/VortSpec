import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function updateStageStatus(
  importId: string,
  stageName: string,
  status: "queued" | "running" | "done" | "failed",
  meta?: { error?: string; result?: Record<string, unknown> },
) {
  const supabase = getSupabase();
  const { data: imp } = await supabase
    .from("imports")
    .select("stage_states")
    .eq("id", importId)
    .single();

  if (!imp) throw new Error(`Import ${importId} not found`);

  const stages = (imp.stage_states ?? {}) as Record<string, unknown>;
  stages[stageName] = {
    status,
    ...(meta?.error ? { error: meta.error } : {}),
    ...(meta?.result ? { result: meta.result } : {}),
  };

  await supabase
    .from("imports")
    .update({ stage_states: stages })
    .eq("id", importId);
}

export async function updateImportStatus(
  importId: string,
  status: "running" | "done" | "failed",
  error?: string,
) {
  const supabase = getSupabase();
  await supabase
    .from("imports")
    .update({ status, ...(error ? { error } : {}) })
    .eq("id", importId);
}
