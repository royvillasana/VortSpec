"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createImport } from "@/lib/data/imports";

export async function startImport(
  projectId: string,
  formData: FormData,
): Promise<{ importId: string; projectId?: string; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file) {
    return { importId: "", error: "No file provided" };
  }

  const supabase = await createServerSupabaseClient();

  // 0. If projectId is "new", create a project first (name from filename)
  let resolvedProjectId = projectId;
  if (projectId === "new") {
    const projectName = file.name.replace(/\.zip$/i, "").replace(/[-_]/g, " ");
    const { data: project, error: projError } = await supabase
      .from("projects")
      .insert({ name: projectName })
      .select()
      .single();

    if (projError || !project) {
      return { importId: "", error: `Failed to create project: ${projError?.message}` };
    }
    resolvedProjectId = project.id;
  }

  // 1. Upload to Supabase Storage
  const storagePath = `${resolvedProjectId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("imports")
    .upload(storagePath, file, {
      contentType: "application/zip",
      upsert: false,
    });

  if (uploadError) {
    return { importId: "", error: `Upload failed: ${uploadError.message}` };
  }

  // 2. Create source record
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .insert({
      project_id: resolvedProjectId,
      kind: "zip",
      storage_ref: storagePath,
    })
    .select()
    .single();

  if (sourceError) {
    return { importId: "", error: `Failed to create source: ${sourceError.message}` };
  }

  // 3. Create import record with all stages queued
  const importRow = await createImport(resolvedProjectId, source.id);

  // 4. Send event to Inngest dev server
  try {
    const inngestUrl = process.env.INNGEST_DEV_URL || "http://localhost:8288";
    await fetch(`${inngestUrl}/e/vortspec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "import/started",
        data: {
          importId: importRow.id,
          projectId: resolvedProjectId,
          sourceId: source.id,
          storagePath,
        },
      }),
    }).catch(() => {
      // Inngest not running — stages will stay queued
    });
  } catch {
    // Non-fatal
  }

  return { importId: importRow.id, projectId: resolvedProjectId };
}
