import { ImportProgress } from "@/components/import/ImportProgress";

export default async function ImportProgressPage({
  params,
}: {
  params: Promise<{ id: string; importId: string }>;
}) {
  const { id, importId } = await params;

  return (
    <ImportProgress
      importId={importId}
      projectId={id}
    />
  );
}
