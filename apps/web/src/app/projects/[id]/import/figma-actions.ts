"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFigmaPAT } from "@/lib/data/figma";

const FIGMA_URL_REGEX = /figma\.com\/(design|file)\/([A-Za-z0-9]+)/;

export async function startFigmaImport(
  projectId: string,
  figmaUrl: string,
): Promise<{ importId: string; error?: string }> {
  // Validate URL
  const match = figmaUrl.match(FIGMA_URL_REGEX);
  if (!match) {
    return { importId: "", error: "Invalid Figma URL. Paste a link like figma.com/design/..." };
  }
  const fileKey = match[2];

  // Check for PAT
  const pat = await getFigmaPAT(projectId);
  if (!pat) {
    return { importId: "", error: "No Figma access token found. Please add your Figma PAT first." };
  }

  const supabase = await createServerSupabaseClient();

  // Create source record
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .insert({
      project_id: projectId,
      kind: "figma",
      figma_file_key: fileKey,
    })
    .select()
    .single();

  if (sourceError || !source) {
    return { importId: "", error: `Failed to create source: ${sourceError?.message}` };
  }

  // Create import record with Figma-specific stages
  const stageStates = {
    discover: { status: "queued" },
    extract_variables: { status: "queued" },
    extract_components: { status: "queued" },
    report: { status: "queued" },
  };

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      project_id: projectId,
      source_id: source.id,
      status: "running",
      stage_states: stageStates,
    })
    .select()
    .single();

  if (importError || !importRow) {
    return { importId: "", error: `Failed to create import: ${importError?.message}` };
  }

  // Trigger Inngest event for Figma import
  try {
    const inngestUrl = process.env.INNGEST_DEV_URL || "http://localhost:8288";
    await fetch(`${inngestUrl}/e/vortspec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "figma-import/started",
        data: {
          importId: importRow.id,
          projectId,
          sourceId: source.id,
          fileKey,
          pat,
        },
      }),
    }).catch(() => {});
  } catch {
    // Non-fatal
  }

  return { importId: importRow.id };
}
