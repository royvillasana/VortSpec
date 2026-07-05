import { ImportProgress } from "@/components/import/ImportProgress";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ImportProgressPage({
  params,
}: {
  params: Promise<{ id: string; importId: string }>;
}) {
  const { id, importId } = await params;

  // Determine source kind (zip or figma) from the import's source
  let sourceKind: "zip" | "figma" = "zip";
  try {
    const supabase = await createServerSupabaseClient();
    const { data: importRow } = await supabase
      .from("imports")
      .select("source_id")
      .eq("id", importId)
      .single();
    if (importRow) {
      const { data: source } = await supabase
        .from("sources")
        .select("kind")
        .eq("id", importRow.source_id)
        .single();
      if (source?.kind === "figma") sourceKind = "figma";
    }
  } catch {
    // Default to zip
  }

  return (
    <ImportProgress
      importId={importId}
      projectId={id}
      sourceKind={sourceKind}
    />
  );
}
