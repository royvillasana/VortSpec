import { ComponentsPanel } from "@/components/inspector/ComponentsPanel";
import { getComponentsForProject } from "@/lib/data/components";

export default async function ComponentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const components = await getComponentsForProject(id);
  return <ComponentsPanel initialComponents={components} />;
}
