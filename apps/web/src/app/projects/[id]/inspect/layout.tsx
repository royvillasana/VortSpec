import { NavRail } from "@/components/shell/NavRail";
import { ChatStrip } from "@/components/shell/ChatStrip";
import { AssistantProvider } from "@/components/inspector/AssistantContext";
import { InspectLayoutInner } from "@/components/shell/InspectLayoutInner";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function getProjectInfo(projectId: string) {
  const supabase = await createServerSupabaseClient();

  const [projectResult, tokenCountResult, issueResult] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("tokens").select("*", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("components").select("doc").eq("project_id", projectId),
  ]);

  const projectName = projectResult.data?.name ?? "Untitled Project";

  // Count issues from all component completeness reports
  let issueCount = 0;
  if (issueResult.data) {
    for (const row of issueResult.data) {
      const doc = row.doc as Record<string, unknown>;
      const completeness = (doc?.completeness ?? {}) as Record<string, unknown>;
      const issues = (completeness.issues ?? []) as unknown[];
      issueCount += issues.length;
    }
  }

  return {
    projectName,
    tokenCount: tokenCountResult.count ?? 0,
    issueCount,
  };
}

export default async function InspectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectInfo = await getProjectInfo(id);

  return (
    <AssistantProvider>
      <InspectLayoutInner
        navRail={
          <NavRail
            projectName={projectInfo.projectName}
            tokenCount={projectInfo.tokenCount}
            issueCount={projectInfo.issueCount}
          />
        }
      >
        {children}
      </InspectLayoutInner>
    </AssistantProvider>
  );
}
