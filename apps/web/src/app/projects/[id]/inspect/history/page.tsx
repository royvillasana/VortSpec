import { HistoryPanel } from "@/components/inspector/HistoryPanel";
import { getHistoryForProject } from "@/lib/data/history";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entries = await getHistoryForProject(id);
  return <HistoryPanel initialEntries={entries} />;
}
