import { TokensPanel } from "@/components/inspector/TokensPanel";
import { getTokensForProject } from "@/lib/data/tokens";

export default async function TokensPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokens = await getTokensForProject(id);
  return <TokensPanel initialTokens={tokens} />;
}
