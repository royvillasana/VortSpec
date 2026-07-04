import { ProjectsDashboard } from "@/components/projects/ProjectsDashboard";
import { getProjects } from "@/lib/data/projects";

export default async function ProjectsPage() {
  const projects = await getProjects();
  return <ProjectsDashboard initialProjects={projects} />;
}
