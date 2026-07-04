"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function deleteProject(projectId: string) {
  const supabase = await createServerSupabaseClient();

  // Storage cleanup: delete all files in the project's import folder
  const { data: files } = await supabase.storage
    .from("imports")
    .list(projectId);
  if (files && files.length > 0) {
    await supabase.storage
      .from("imports")
      .remove(files.map((f) => `${projectId}/${f.name}`));
  }

  // Cascade delete handles sources, imports, tokens, components, patches
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) throw new Error(`Failed to delete project: ${error.message}`);

  revalidatePath("/projects");
}
