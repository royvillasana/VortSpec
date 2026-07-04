import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Issue, IssueKind, IssueSeverity } from "@/types/ir";

const KIND_MAP: Record<string, IssueKind> = {
  "flagged-literal": "raw-value",
  "unconfirmed-inference": "unconfirmed-inference",
  "token-conflict": "token-conflict",
  "near-duplicate-tokens": "possible-duplicate",
  "unused-token": "raw-value",
  "missing-state": "missing-state",
  "contrast-failure": "low-contrast",
  "unnamed-node": "raw-value",
};

/**
 * Fetch all issues across all components for a project.
 * Issues are embedded in ComponentIR.completeness.issues.
 */
export async function getIssuesForProject(projectId: string): Promise<Issue[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("components")
    .select("id, doc")
    .eq("project_id", projectId);

  if (error) throw new Error(`Failed to fetch components for issues: ${error.message}`);
  if (!data) return [];

  const allIssues: Issue[] = [];

  for (const row of data) {
    const doc = row.doc as Record<string, unknown>;
    const componentName = String(doc.name ?? "Untitled");
    const completeness = (doc.completeness ?? {}) as Record<string, unknown>;
    const issues = (completeness.issues ?? []) as Array<Record<string, unknown>>;

    for (const issue of issues) {
      const targets = (issue.targets ?? []) as Array<Record<string, unknown>>;
      const firstTarget = targets[0] ?? {};

      allIssues.push({
        id: String(issue.id ?? `iss-${allIssues.length}`),
        severity: (issue.severity ?? "info") as IssueSeverity,
        kind: KIND_MAP[String(issue.kind ?? "")] ?? "raw-value",
        title: extractTitle(String(issue.message ?? "")),
        description: String(issue.message ?? ""),
        componentId: String(firstTarget.componentId ?? row.id),
        componentName,
        tokenId: firstTarget.tokenId ? String(firstTarget.tokenId) : undefined,
        tokenName: undefined,
        suggestedAction: issue.suggestedAction ? "Fix" : undefined,
        resolved: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return allIssues;
}

function extractTitle(message: string): string {
  // Use first sentence or first 80 chars
  const dot = message.indexOf(".");
  if (dot > 0 && dot < 80) return message.slice(0, dot);
  if (message.length > 80) return message.slice(0, 77) + "…";
  return message;
}
