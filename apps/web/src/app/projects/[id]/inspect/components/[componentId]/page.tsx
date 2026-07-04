import { ComponentDetail } from "@/components/inspector/ComponentDetail";
import { getComponentDetail } from "@/lib/data/components";

export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string; componentId: string }> }) {
  const { id, componentId } = await params;
  const component = await getComponentDetail(id, componentId);
  if (!component) return <div className="p-6 text-vs-text-muted">Component not found</div>;
  return <ComponentDetail initialData={component} />;
}
