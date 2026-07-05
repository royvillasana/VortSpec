import { ComponentDetail } from "@/components/inspector/ComponentDetail";
import { getComponentDetail } from "@/lib/data/components";
import { getCodeArtifact } from "@/lib/data/codegen";

export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string; componentId: string }> }) {
  const { id, componentId } = await params;
  const component = await getComponentDetail(id, componentId);
  if (!component) return <div className="p-6 text-vs-text-muted">Component not found</div>;

  // Fetch code artifact if it exists
  let codeArtifact = null;
  try {
    codeArtifact = await getCodeArtifact(componentId);
  } catch {
    // code_artifacts table might not exist yet
  }

  return <ComponentDetail initialData={component} codeArtifact={codeArtifact} />;
}
