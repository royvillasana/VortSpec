"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createImport } from "@/lib/data/imports";

export async function startImport(
  projectId: string,
  formData: FormData,
): Promise<{ importId: string; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file) {
    return { importId: "", error: "No file provided" };
  }

  const supabase = await createServerSupabaseClient();

  // 1. Upload to Supabase Storage
  const storagePath = `${projectId}/${Date.now()}-${file.name}`;
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
      project_id: projectId,
      kind: "zip",
      storage_ref: storagePath,
    })
    .select()
    .single();

  if (sourceError) {
    return { importId: "", error: `Failed to create source: ${sourceError.message}` };
  }

  // 3. Create import record with all stages queued
  const importRow = await createImport(projectId, source.id);

  // 4. Trigger Inngest pipeline (via fetch to our own API)
  // In production this would be inngest.send(), but for now we POST to the event endpoint
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    await fetch(`${baseUrl}/api/inngest`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "import/started",
        data: {
          importId: importRow.id,
          projectId,
          sourceId: source.id,
          storagePath,
        },
      }),
    }).catch(() => {
      // Inngest not running — stages will stay queued
    });
  } catch {
    // Non-fatal — pipeline will be picked up when Inngest comes online
  }

  return { importId: importRow.id };
}
