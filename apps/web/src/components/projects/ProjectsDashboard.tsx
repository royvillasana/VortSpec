"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompletenessScore } from "@/components/ui/completeness-score";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ProjectWithStats } from "@/lib/data/projects";
import { deleteProject } from "@/app/projects/actions";

/* ── Icons ─────────────────────────────────────────────────────── */

function ZipGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size + 2} viewBox="0 0 14 16" fill="none" className="flex-none">
      <rect x="1" y="0.5" width="12" height="15" rx="2" stroke="#6B7280" strokeWidth="1.2" />
      <rect x="5" y="0.5" width="2" height="2" fill="#6B7280" />
      <rect x="7" y="2.5" width="2" height="2" fill="#6B7280" />
      <rect x="5" y="4.5" width="2" height="2" fill="#6B7280" />
    </svg>
  );
}

function FigmaGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size + 4} viewBox="0 0 12 16" fill="none" className="flex-none">
      <path d="M3 16a3 3 0 0 0 3-3v-3H3a3 3 0 0 0 0 6Z" fill="#0ACF83" />
      <path d="M0 8a3 3 0 0 1 3-3h3v6H3a3 3 0 0 1-3-3Z" fill="#A259FF" />
      <path d="M0 3a3 3 0 0 1 3-3h3v6H3a3 3 0 0 1-3-3Z" fill="#F24E1E" />
      <path d="M6 0h3a3 3 0 0 1 0 6H6V0Z" fill="#FF7262" />
      <path d="M12 8a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3 3Z" fill="#1ABCFE" />
    </svg>
  );
}

function CubeAssemblyIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="flex-none">
      <path d="M20 18 L44 18 L44 42 L20 42 Z" fill="#1B1D21" stroke="#34373D" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M44 18 L52 12 L52 36 L44 42 Z" fill="#141518" stroke="#34373D" strokeWidth="1.5" />
      <path d="M20 18 L28 12 L52 12 L44 18 Z" fill="#1B1D21" stroke="#34373D" strokeWidth="1.5" />
      <g style={{ transform: "translate(0px, 2px)" }}>
        <path d="M18 22 L42 22 L42 46 L18 46 Z" fill="#141518" stroke="#7C6FF0" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/* ── Data mapping ──────────────────────────────────────────────── */

interface Project {
  id: string;
  name: string;
  sources: ("figma" | "zip")[];
  href: string;
  importing?: { stage: number; totalStages: number };
  tokens: number;
  components: number;
  approved: number;
  score?: number;
  updated: string;
}

function mapProject(p: ProjectWithStats): Project {
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
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "Updated yesterday";
  return `Updated ${diffDays}d ago`;
}

/* ── Delete confirm dialog ─────────────────────────────────────── */

function DeleteDialog({ project, onClose, onConfirm, pending }: {
  project: Project;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={onClose}>
      <div className="w-[400px] bg-vs-bg-surface border border-vs-border-strong rounded-lg shadow-2xl" style={{ animation: "vsDlgIn 0.15s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-vs-border-default">
          <h3 className="text-[15px] font-semibold">Delete project?</h3>
        </div>
        <div className="px-5 py-4 text-[13px] text-vs-text-secondary leading-relaxed">
          <p>
            <span className="text-vs-text-primary font-medium">{project.name}</span> and all its
            tokens, components, and import data will be permanently deleted.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-vs-border-default flex justify-end gap-3">
          <button onClick={onClose} disabled={pending} className="text-[13px] text-vs-text-secondary border border-vs-border-strong rounded-lg px-4 py-2 bg-transparent cursor-pointer hover:bg-vs-bg-elevated disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={pending} className="text-[13px] font-medium text-white bg-vs-error rounded-lg px-4 py-2 border-none cursor-pointer hover:brightness-110 disabled:opacity-50">
            {pending ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Project Card (grid view) ──────────────────────────────────── */

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const isImporting = !!project.importing;

  return (
    <div className="relative group bg-vs-bg-surface border border-vs-border-default rounded-lg p-5 transition-all hover:border-vs-border-strong hover:shadow-[inset_2px_0_0_#7C6FF0]">
      <Link href={project.href} className="absolute inset-0 rounded-lg" />

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        className="absolute top-3 right-3 w-6 h-6 rounded-md flex items-center justify-center text-vs-text-muted hover:text-vs-error hover:bg-vs-bg-elevated opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
        title="Delete project"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M9 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Name */}
      <h3 className="text-[15px] font-semibold text-vs-text-primary mb-2.5 pr-6 relative z-[1] pointer-events-none">
        {project.name}
      </h3>

      {/* Source icons */}
      <div className="flex items-center gap-2 mb-4 relative z-[1] pointer-events-none">
        {project.sources.map((src) => (
          <span key={src} title={src === "figma" ? "Figma" : "ZIP export"}>
            {src === "figma" ? <FigmaGlyph /> : <ZipGlyph />}
          </span>
        ))}
      </div>

      {/* Stats or importing */}
      <div className="relative z-[1] pointer-events-none">
        {isImporting ? (
          <div className="mb-3">
            <div className="h-[3px] bg-vs-border-default rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-vs-warning"
                style={{ width: `${(project.importing!.stage / project.importing!.totalStages) * 100}%` }}
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

        {/* Footer */}
        <div className="flex items-center justify-between">
          {project.score != null ? <CompletenessScore score={project.score} /> : <span />}
          <span className="text-[12px] text-vs-text-muted">{project.updated}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Project Row (list view) ───────────────────────────────────── */

function ProjectRow({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const isImporting = !!project.importing;

  return (
    <div className="relative group flex items-center h-[52px] px-5 bg-vs-bg-surface border-b border-vs-border-default hover:bg-vs-bg-hover hover:shadow-[inset_2px_0_0_#7C6FF0] transition-all">
      <Link href={project.href} className="absolute inset-0" />

      {/* Name */}
      <span className="text-[13px] font-medium text-vs-text-primary w-[240px] truncate relative z-[1] pointer-events-none">
        {project.name}
      </span>

      {/* Sources */}
      <span className="flex items-center gap-1.5 w-[80px] relative z-[1] pointer-events-none">
        {project.sources.map((src) => (
          <span key={src}>
            {src === "figma" ? <FigmaGlyph size={10} /> : <ZipGlyph size={10} />}
          </span>
        ))}
      </span>

      {/* Stats or importing */}
      {isImporting ? (
        <span className="flex-1 flex items-center gap-3 relative z-[1] pointer-events-none">
          <div className="w-[80px] h-[3px] bg-vs-border-default rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-vs-warning"
              style={{ width: `${(project.importing!.stage / project.importing!.totalStages) * 100}%` }}
            />
          </div>
          <span className="text-[12px] text-vs-warning">
            stage {project.importing!.stage}/{project.importing!.totalStages}
          </span>
        </span>
      ) : (
        <span className="flex-1 flex items-center gap-6 relative z-[1] pointer-events-none">
          <span className="font-mono text-[12px] text-vs-text-secondary">{project.tokens} tokens</span>
          <span className="font-mono text-[12px] text-vs-text-secondary">{project.components} comp</span>
          <span className="font-mono text-[12px] text-vs-text-secondary">{project.approved} approved</span>
        </span>
      )}

      {/* Score */}
      <span className="w-[60px] flex justify-end relative z-[1] pointer-events-none">
        {project.score != null ? <CompletenessScore score={project.score} /> : null}
      </span>

      {/* Updated */}
      <span className="w-[110px] text-right text-[12px] text-vs-text-muted relative z-[1] pointer-events-none">
        {project.updated}
      </span>

      {/* Delete */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        className="relative z-10 ml-3 w-6 h-6 rounded-md flex items-center justify-center text-vs-text-muted hover:text-vs-error hover:bg-vs-bg-elevated opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
        title="Delete project"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M9 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────── */

export function ProjectsDashboard({ initialProjects }: { initialProjects?: ProjectWithStats[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<string>("Cards");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const projects = initialProjects && initialProjects.length > 0
    ? initialProjects.map(mapProject)
    : [];

  const handleDelete = (project: Project) => {
    setDeleteTarget(project);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-vs-bg-primary">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default bg-vs-bg-primary">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-vs-text-primary">
          <img src="/favicon.png" alt="" width={20} height={20} className="flex-none" />
          VortSpec
        </span>
        <button type="button" className="w-7 h-7 rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center cursor-pointer">
          <span className="text-[11px] text-vs-text-secondary leading-none">RV</span>
        </button>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary">
            Projects
            {projects.length > 0 && (
              <span className="font-mono text-[13px] text-vs-text-muted font-normal ml-2">{projects.length}</span>
            )}
          </h1>
          <div className="flex items-center gap-3">
            <SegmentedControl
              options={["Cards", "List"]}
              value={view}
              onChange={setView}
              size="sm"
            />
            <Link
              href="/projects/new/import"
              className="bg-vs-accent text-white rounded-lg px-4 py-2 text-[13px] font-medium no-underline hover:brightness-110 transition-all"
            >
              New project
            </Link>
          </div>
        </div>

        {/* Content */}
        {projects.length === 0 ? (
          <div className="bg-vs-bg-surface border border-vs-border-default rounded-lg py-16 px-6 flex flex-col items-center text-center">
            <div className="mb-5"><CubeAssemblyIcon /></div>
            <h2 className="text-[15px] font-semibold text-vs-text-primary mb-1.5">No projects yet</h2>
            <p className="text-[13px] text-vs-text-secondary leading-relaxed max-w-[340px] mb-5">
              Import a design from Figma or a ZIP export to get started.
            </p>
            <Link href="/projects/new/import" className="bg-vs-accent text-white rounded-lg px-4 py-2 text-[13px] font-medium no-underline hover:brightness-110 transition-all">
              New project
            </Link>
          </div>
        ) : view === "Cards" ? (
          <div className="grid grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={() => handleDelete(p)} />
            ))}
          </div>
        ) : (
          <div className="border border-vs-border-default rounded-lg overflow-hidden">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} onDelete={() => handleDelete(p)} />
            ))}
          </div>
        )}
      </main>

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          pending={isPending}
        />
      )}
    </div>
  );
}
