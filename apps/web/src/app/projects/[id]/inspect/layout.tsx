import { NavRail } from "@/components/shell/NavRail";
import { ChatStrip } from "@/components/shell/ChatStrip";
import { AssistantProvider } from "@/components/inspector/AssistantContext";
import { InspectLayoutInner } from "@/components/shell/InspectLayoutInner";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function getProjectInfo(projectId: string) {
  const supabase = await createServerSupabaseClient();

  const [projectResult, tokenCountResult, issueResult] = await Promise.all([
    supabase.from("projects").select("name, framework, style_library").eq("id", projectId).single(),
    supabase.from("tokens").select("*", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("components").select("doc").eq("project_id", projectId),
  ]);

  const projectData = projectResult.data as { name?: string; framework?: string; style_library?: string } | null;
  const projectName = projectData?.name ?? "Untitled Project";

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

  // Format framework/style labels for display
  const frameworkLabels: Record<string, string> = {
    react: "React",
    nextjs: "Next.js",
    vue: "Vue",
    svelte: "Svelte",
  };
  const styleLabels: Record<string, string> = {
    tailwind: "Tailwind",
    "css-modules": "CSS Modules",
    "styled-components": "styled-components",
  };

  return {
    projectName,
    tokenCount: tokenCountResult.count ?? 0,
    issueCount,
    framework: projectData?.framework
      ? frameworkLabels[projectData.framework] ?? projectData.framework
      : undefined,
    styleLibrary: projectData?.style_library
      ? styleLabels[projectData.style_library] ?? projectData.style_library
      : undefined,
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
            framework={projectInfo.framework}
            styleLibrary={projectInfo.styleLibrary}
          />
        }
      >
        {children}
      </InspectLayoutInner>
    </AssistantProvider>
  );
}
