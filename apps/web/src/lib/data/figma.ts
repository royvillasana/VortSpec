"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// In dev bypass mode there's no real user, so we use a fixed "global" project ID
// to store user-level settings like the Figma PAT.
const GLOBAL_SETTINGS_PROJECT = "00000000-0000-0000-0000-000000000000";

/**
 * Save a Figma Personal Access Token (user-level, reused across all projects).
 */
export async function saveFigmaPAT(pat: string) {
  const supabase = await createServerSupabaseClient();

  // Delete any existing figma key
  await supabase
    .from("project_ai_keys")
    .delete()
    .eq("provider", "figma");

  const fingerprint = `figt_${pat.slice(0, 4)}****${pat.slice(-4)}`;

  // We need a project_id for the FK — create a dummy settings row if needed
  // First try to use the global settings project
  const { error } = await supabase.from("project_ai_keys").insert({
    project_id: GLOBAL_SETTINGS_PROJECT,
    provider: "figma",
    encrypted_key: pat,
    fingerprint,
  });

  // If FK fails (no project with that ID), try finding any existing project
  if (error) {
    const { data: anyProject } = await supabase
      .from("projects")
      .select("id")
      .limit(1)
      .single();

    if (anyProject) {
      await supabase.from("project_ai_keys").insert({
        project_id: anyProject.id,
        provider: "figma",
        encrypted_key: pat,
        fingerprint,
      });
    } else {
      // No projects exist — create one to hold the key
      const { data: newProj } = await supabase
        .from("projects")
        .insert({ name: "_settings" })
        .select()
        .single();

      if (newProj) {
        await supabase.from("project_ai_keys").insert({
          project_id: newProj.id,
          provider: "figma",
          encrypted_key: pat,
          fingerprint,
        });
      }
    }
  }

  return { fingerprint };
}

/**
 * Get the Figma PAT (user-level, works for any project).
 */
export async function getFigmaPAT(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("project_ai_keys")
    .select("encrypted_key")
    .eq("provider", "figma")
    .limit(1)
    .single();

  return data?.encrypted_key ?? null;
}

/**
 * Check if a Figma PAT exists (safe for client display).
 */
export async function hasFigmaPAT(): Promise<{ exists: boolean; fingerprint?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("project_ai_keys")
    .select("fingerprint")
    .eq("provider", "figma")
    .limit(1)
    .single();

  return data ? { exists: true, fingerprint: data.fingerprint } : { exists: false };
}
