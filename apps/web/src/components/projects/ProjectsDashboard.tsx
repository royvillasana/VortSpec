"use client";

import Link from "next/link";
import { CompletenessScore } from "@/components/ui/completeness-score";
import type { ProjectWithStats } from "@/lib/data/projects";

/* ── Icons ─────────────────────────────────────────────────────── */

function FigmaGlyph() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="none" className="flex-none">
      <path d="M3 16a3 3 0 0 0 3-3v-3H3a3 3 0 0 0 0 6Z" fill="#0ACF83" />
      <path d="M0 8a3 3 0 0 1 3-3h3v6H3a3 3 0 0 1-3-3Z" fill="#A259FF" />
      <path d="M0 3a3 3 0 0 1 3-3h3v6H3a3 3 0 0 1-3-3Z" fill="#F24E1E" />
      <path d="M6 0h3a3 3 0 0 1 0 6H6V0Z" fill="#FF7262" />
      <path d="M12 8a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3 3Z" fill="#1ABCFE" />
    </svg>
  );
}

function ZipGlyph() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" className="flex-none">
      <rect x="1" y="0.5" width="12" height="15" rx="2" stroke="#6B7280" strokeWidth="1.2" />
      <rect x="5" y="0.5" width="2" height="2" fill="#6B7280" />
      <rect x="7" y="2.5" width="2" height="2" fill="#6B7280" />
      <rect x="5" y="4.5" width="2" height="2" fill="#6B7280" />
      <rect x="7" y="6.5" width="2" height="2" fill="#6B7280" />
      <path d="M5 9.5h4v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-4Z" stroke="#6B7280" strokeWidth="1" />
    </svg>
  );
}

function CubeAssemblyIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="flex-none">
      {/* Back face */}
      <path d="M20 18 L44 18 L44 42 L20 42 Z" fill="#1B1D21" stroke="#34373D" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Side face */}
      <path d="M44 18 L52 12 L52 36 L44 42 Z" fill="#141518" stroke="#34373D" strokeWidth="1.5" />
      {/* Top face */}
      <path d="M20 18 L28 12 L52 12 L44 18 Z" fill="#1B1D21" stroke="#34373D" strokeWidth="1.5" />
      {/* Front face assembling - offset to show movement */}
      <g style={{ transform: "translate(0px, 2px)" }}>
        <path d="M18 22 L42 22 L42 46 L18 46 Z" fill="#141518" stroke="#7C6FF0" strokeWidth="1.5" />
        {/* Grid lines on front face */}
        <line x1="26" y1="22" x2="26" y2="46" stroke="#7C6FF0" strokeWidth="0.5" opacity="0.4" />
        <line x1="34" y1="22" x2="34" y2="46" stroke="#7C6FF0" strokeWidth="0.5" opacity="0.4" />
        <line x1="18" y1="30" x2="42" y2="30" stroke="#7C6FF0" strokeWidth="0.5" opacity="0.4" />
        <line x1="18" y1="38" x2="42" y2="38" stroke="#7C6FF0" strokeWidth="0.5" opacity="0.4" />
      </g>
      {/* Small floating piece */}
      <g opacity="0.6">
        <rect x="46" y="6" width="8" height="8" rx="1" fill="#141518" stroke="#7C6FF0" strokeWidth="1" strokeDasharray="2 2" />
      </g>
    </svg>
  );
}

/* ── Data ───────────────────────────────────────────────────────── */

interface Project {
  id: string;
  name: string;
  sources: ("figma" | "zip")[];
  href: string;
  importing?: { stage: number; totalStages: number };
  tokens?: number;
  components?: number;
  approved?: number;
  score?: number;
  updated: string;
}

const defaultProjects: Project[] = [
  {
    id: "proj-1",
    name: "Meridian Design System",
    sources: ["figma", "zip"],
    href: "/projects/proj-1/inspect/tokens",
    tokens: 48,
    components: 12,
    approved: 3,
    score: 82,
    updated: "Updated 2h ago",
  },
  {
    id: "proj-2",
    name: "Checkout Redesign",
    sources: ["zip"],
    href: "/projects/proj-2/import/imp-1",
    importing: { stage: 4, totalStages: 6 },
    updated: "Updated 4h ago",
  },
  {
    id: "proj-3",
    name: "PatitasVIP Landing",
    sources: ["zip"],
    href: "/projects/proj-3/inspect/tokens",
    tokens: 23,
    components: 6,
    approved: 0,
    score: 47,
    updated: "Updated yesterday",
  },
];

function mapProjectWithStats(p: ProjectWithStats): Project {
  const isImporting = p.import_status === "running";
  return {
    id: p.id,
    name: p.name,
    sources: p.sources.map((s) => (s === "figma" ? "figma" : "zip")) as ("figma" | "zip")[],
    href: isImporting
      ? `/projects/${p.id}/import`
      : `/projects/${p.id}/inspect/tokens`,
    importing: isImporting && p.import_stage != null && p.import_total_stages != null
      ? { stage: p.import_stage, totalStages: p.import_total_stages }
      : undefined,
    tokens: p.token_count,
    components: p.component_count,
    approved: p.approved_count,
    score: p.completeness_score ?? undefined,
    updated: formatRelativeTime(p.created_at),
  };
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "Updated yesterday";
  return `Updated ${diffDays}d ago`;
}

/* ── Top Bar ───────────────────────────────────────────────────── */

function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default bg-vs-bg-primary">
      <span className="text-[15px] font-semibold tracking-tight text-vs-text-primary">
        VortSpec
      </span>
      <button
        type="button"
        className="w-7 h-7 rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center cursor-pointer hover:border-vs-border-strong"
      >
        <span className="text-[11px] text-vs-text-secondary leading-none">RV</span>
      </button>
    </header>
  );
}

/* ── Project Card ──────────────────────────────────────────────── */

function ProjectCard({ project }: { project: Project }) {
  const isImporting = !!project.importing;

  return (
    <Link
      href={project.href}
      className="block bg-vs-bg-surface border border-[#1B1D21] rounded-lg p-5 transition-all hover:border-vs-border-strong hover:shadow-[inset_2px_0_0_#7C6FF0] no-underline text-inherit"
    >
      {/* Project name */}
      <h3 className="text-[15px] font-semibold text-vs-text-primary mb-2.5">
        {project.name}
      </h3>

      {/* Source icons */}
      <div className="flex items-center gap-2 mb-4">
        {project.sources.map((src) => (
          <span key={src} className="flex items-center" title={src === "figma" ? "Figma" : "ZIP export"}>
            {src === "figma" ? <FigmaGlyph /> : <ZipGlyph />}
          </span>
        ))}
      </div>

      {/* Stats or importing state */}
      {isImporting ? (
        <div className="mb-3">
          <div className="h-[3px] bg-vs-border-default rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-vs-warning"
              style={{
                width: `${(project.importing!.stage / project.importing!.totalStages) * 100}%`,
                animation: "vsImportPulse 2s ease-in-out infinite",
              }}
            />
          </div>
          <span className="text-[12px] text-vs-warning">
            Normalizing… stage {project.importing!.stage} of {project.importing!.totalStages}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-4 mb-4">
          <span>
            <span className="font-mono text-[12px] text-vs-text-primary">{project.tokens}</span>
            <span className="text-[12px] text-vs-text-secondary ml-1">tokens</span>
          </span>
          <span>
            <span className="font-mono text-[12px] text-vs-text-primary">{project.components}</span>
            <span className="text-[12px] text-vs-text-secondary ml-1">components</span>
          </span>
          <span>
            <span className="font-mono text-[12px] text-vs-text-primary">{project.approved}</span>
            <span className="text-[12px] text-vs-text-secondary ml-1">approved</span>
          </span>
        </div>
      )}

      {/* Footer: score + timestamp */}
      <div className="flex items-center justify-between">
        {project.score !== undefined ? (
          <CompletenessScore score={project.score} />
        ) : (
          <span />
        )}
        <span className="text-[12px] text-vs-text-muted">{project.updated}</span>
      </div>
    </Link>
  );
}

/* ── Empty State ───────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="bg-vs-bg-surface border border-[#1B1D21] rounded-lg py-16 px-6 flex flex-col items-center text-center">
      <div className="mb-5">
        <CubeAssemblyIcon />
      </div>
      <h2 className="text-[15px] font-semibold text-vs-text-primary mb-1.5">
        No projects yet
      </h2>
      <p className="text-[13px] text-vs-text-secondary leading-relaxed max-w-[340px] mb-5">
        Import a design from Figma or a ZIP export to get started.
      </p>
      <Link
        href="/projects/new/import"
        className="bg-vs-accent text-white rounded-lg px-4 py-2 text-[13px] font-medium no-underline hover:brightness-110 transition-all"
      >
        New project
      </Link>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────── */

export function ProjectsDashboard({ initialProjects }: { initialProjects?: ProjectWithStats[] }) {
  const projects = initialProjects && initialProjects.length > 0
    ? initialProjects.map(mapProjectWithStats)
    : defaultProjects;

  return (
    <div className="min-h-screen bg-vs-bg-primary">
      <TopBar />

      <main className="max-w-[1120px] mx-auto px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary">
            Projects
          </h1>
          <Link
            href="/projects/new/import"
            className="bg-vs-accent text-white rounded-lg px-4 py-2 text-[13px] font-medium no-underline hover:brightness-110 transition-all"
          >
            New project
          </Link>
        </div>

        {/* Project cards */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>

        {/* Empty state shown below for reference */}
        {projects.length === 0 && <EmptyState />}
      </main>
    </div>
  );
}
