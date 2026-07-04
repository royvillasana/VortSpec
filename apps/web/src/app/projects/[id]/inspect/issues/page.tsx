import { IssuesPanel } from "@/components/inspector/IssuesPanel";
import { getIssuesForProject } from "@/lib/data/issues";

export default async function IssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issues = await getIssuesForProject(id);
  return <IssuesPanel initialIssues={issues} />;
}
