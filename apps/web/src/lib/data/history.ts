import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface HistoryEntry {
  id: string;
  title: string;
  author: "user" | "assistant" | "pipeline";
  kind: "patch" | "import";
  rejected?: boolean;
  versionFrom?: number;
  versionTo?: number;
  timestamp: string;
  renames?: Array<{ from: string; to: string }>;
  undoable?: boolean;
  importMeta?: string;
}

/**
 * Fetch history (patches + imports) for a project.
 */
export async function getHistoryForProject(projectId: string): Promise<HistoryEntry[]> {
  const supabase = await createServerSupabaseClient();

  const [patchResult, importResult] = await Promise.all([
    supabase
      .from("patches")
      .select("id, doc, status, base_version, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("imports")
      .select("id, status, stage_states, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  const entries: HistoryEntry[] = [];

  // Patches → history entries
  if (patchResult.data) {
    for (const row of patchResult.data) {
      const doc = (row.doc ?? {}) as Record<string, unknown>;
      const ops = (doc.ops ?? []) as Array<Record<string, unknown>>;

      // Extract renames from token.update ops
      const renames: Array<{ from: string; to: string }> = [];
      for (const op of ops) {
        if (op.op === "token.update") {
          const changes = (op.changes ?? {}) as Record<string, unknown>;
          if (changes.name) {
            renames.push({ from: String(op.tokenId ?? ""), to: String(changes.name) });
          }
        }
      }

      entries.push({
        id: row.id,
        title: String(doc.summary ?? "Patch"),
        author: (doc.generatedBy ?? "user") as "user" | "assistant" | "pipeline",
        kind: "patch",
        rejected: row.status === "rejected",
        versionFrom: row.base_version,
        versionTo: doc.resultVersion ? Number(doc.resultVersion) : (row.base_version ?? 0) + 1,
        timestamp: row.created_at,
        renames: renames.length > 0 ? renames : undefined,
        undoable: row.status === "applied",
      });
    }
  }

  // Imports → history entries
  if (importResult.data) {
    for (const row of importResult.data) {
      const stages = (row.stage_states ?? {}) as Record<string, Record<string, unknown>>;
      const report = stages.report?.result as Record<string, unknown> | undefined;
      const meta = report
        ? `${report.tokenCount ?? 0} tokens, ${report.componentCount ?? 0} components`
        : row.status === "done" ? "Import completed" : `Import ${row.status}`;

      entries.push({
        id: row.id,
        title: `Imported design export`,
        author: "pipeline",
        kind: "import",
        timestamp: row.created_at,
        importMeta: meta,
      });
    }
  }

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return entries;
}
