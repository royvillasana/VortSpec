"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Save the code generation configuration for a project.
 */
export async function saveProjectConfig(
  projectId: string,
  framework: string,
  styleLibrary: string,
  componentLibrary: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("projects")
    .update({
      framework,
      style_library: styleLibrary,
      component_library: componentLibrary,
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to save project config: ${error.message}`);
  }
}

/**
 * Read the code generation configuration for a project.
 */
export async function getProjectConfig(projectId: string): Promise<{
  framework: string;
  styleLibrary: string;
  componentLibrary: string;
} | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("projects")
    .select("framework, style_library, component_library")
    .eq("id", projectId)
    .single();

  if (error || !data) return null;

  return {
    framework: data.framework ?? "react",
    styleLibrary: data.style_library ?? "tailwind",
    componentLibrary: data.component_library ?? "none",
  };
}
