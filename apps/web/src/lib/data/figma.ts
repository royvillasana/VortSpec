"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Save a Figma Personal Access Token for a project.
 */
export async function saveFigmaPAT(projectId: string, pat: string) {
  const supabase = await createServerSupabaseClient();

  // Upsert: replace existing figma key for this project
  await supabase
    .from("project_ai_keys")
    .delete()
    .eq("project_id", projectId)
    .eq("provider", "figma");

  const fingerprint = `figt_${pat.slice(0, 4)}****${pat.slice(-4)}`;

  await supabase.from("project_ai_keys").insert({
    project_id: projectId,
    provider: "figma",
    encrypted_key: pat, // TODO: proper encryption in production
    fingerprint,
  });

  revalidatePath(`/projects/${projectId}`);
  return { fingerprint };
}

/**
 * Get the Figma PAT for a project (server-side only).
 */
export async function getFigmaPAT(projectId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("project_ai_keys")
    .select("encrypted_key")
    .eq("project_id", projectId)
    .eq("provider", "figma")
    .single();

  return data?.encrypted_key ?? null;
}

/**
 * Check if a Figma PAT exists for a project (safe for client display).
 */
export async function hasFigmaPAT(projectId: string): Promise<{ exists: boolean; fingerprint?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("project_ai_keys")
    .select("fingerprint")
    .eq("project_id", projectId)
    .eq("provider", "figma")
    .single();

  return data ? { exists: true, fingerprint: data.fingerprint } : { exists: false };
}
