import { useEffect, useState } from "react";
import type { Project, RunStageSummary, RunSummary } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Spinner } from "@vortspec/ui/ui";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";

const OUTCOME: Record<RunSummary["outcome"], { label: string; color: string; border: string; bg: string }> = {
  passed: { label: "passed", color: "#30A46C", border: "rgba(48,164,108,0.35)", bg: "rgba(48,164,108,0.08)" },
  "in-review": { label: "in review", color: "#FFB224", border: "rgba(255,178,36,0.4)", bg: "rgba(255,178,36,0.08)" },
  running: { label: "running", color: "#7C6FF0", border: "rgba(124,111,240,0.4)", bg: "rgba(124,111,240,0.08)" },
  cancelled: { label: "cancelled", color: "#E5484D", border: "rgba(229,72,77,0.4)", bg: "rgba(229,72,77,0.06)" },
  failed: { label: "failed", color: "#E5484D", border: "rgba(229,72,77,0.4)", bg: "rgba(229,72,77,0.06)" },
  "in-progress": { label: "in progress", color: "#6B7280", border: "#26282D", bg: "#0B0C0E" },
};

/**
 * Run history (US-11, design: "History.dc.html") — a vertical timeline of runs,
 * each expandable to its stage decisions + artifacts. Sourced from the project's
 * files: the current flow (synthesized) plus any recorded runs in .vortspec/runs/.
 */
export function History({
  project,
  onBack,
  onOpenRun,
  onOpenPreview,
  onOpenInspector,
  onOpenManifest,
}: {
  project: Project;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenPreview: () => void;
  onOpenInspector: () => void;
  onOpenManifest: () => void;
}): React.JSX.Element {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set(["current"]));

  useEffect(() => {
    void api.getHistory(project.path).then((r) => setRuns(r.runs));
  }, [project.path]);

  function toggle(id: string): void {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("history", {
          onFlow: onBack,
          onRun: onOpenRun,
          onPlayground: onOpenPreview,
          onTokens: onOpenInspector,
          onManifest: onOpenManifest,
          onHistory: () => undefined,
        })}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-7 pb-3.5 pt-5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">History</h1>
          <span className="font-mono text-xs text-vs-text-muted">
            {runs ? `${runs.length} run${runs.length === 1 ? "" : "s"}` : ""} · .vortspec/runs/
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-7 pb-12 pt-6">
          {runs === null ? (
            <div className="flex items-center gap-2 text-sm text-vs-text-secondary">
              <Spinner /> Reading history…
            </div>
          ) : (
            <div className="flex max-w-[680px] flex-col">
              {runs.map((run, i) => (
                <RunRow
                  key={run.id}
                  run={run}
                  isLast={i === runs.length - 1}
                  open={open.has(run.id)}
                  onToggle={() => toggle(run.id)}
                />
              ))}
              <p className="mt-4 pl-7 text-xs text-vs-text-muted">
                Past runs are recorded to <span className="font-mono">.vortspec/runs/</span> and will
                appear here as separate entries.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RunRow({
  run,
  isLast,
  open,
  onToggle,
}: {
  run: RunSummary;
  isLast: boolean;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const o = OUTCOME[run.outcome];
  const review = run.outcome === "in-review";
  return (
    <div className="flex gap-4">
      <div className="flex w-3 flex-none flex-col items-center">
        <span
          className="mt-4 h-[9px] w-[9px] flex-none rounded-full border-2 border-vs-bg-primary"
          style={{ background: o.color, boxShadow: `0 0 0 1px ${o.color}` }}
        />
        {!isLast && <span className="w-px flex-1 bg-vs-border-default" />}
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <div
          className="overflow-hidden rounded-lg border bg-vs-bg-surface"
          style={{
            borderColor: review ? "#34373D" : "#26282D",
            boxShadow: review ? "inset 2px 0 0 #FFB224" : "none",
          }}
        >
          <button
            onClick={onToggle}
            className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-vs-bg-hover"
          >
            <span className="flex w-3.5 flex-none items-center justify-center">
              <OutcomeIcon outcome={run.outcome} />
            </span>
            <span className="flex-none font-mono text-[11px] text-vs-text-muted">{run.label}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-vs-text-primary">
              {run.title}
            </span>
            <span
              className="flex-none rounded-full border px-2 py-px font-mono text-[10px]"
              style={{ color: o.color, borderColor: o.border, background: o.bg }}
            >
              {o.label}
            </span>
            <span className="w-[74px] flex-none text-right text-[11px] text-vs-text-muted">
              {relativeTime(run.updatedAt)}
            </span>
            <span
              className="flex-none text-[9px] text-vs-text-muted transition-transform"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
          </button>

          {open && (
            <div className="flex flex-col gap-0.5 border-t border-vs-border-default py-3 pl-10 pr-3.5">
              {run.stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5 py-1 text-xs">
                  <StageIcon status={s.status} />
                  <span className="w-[150px] flex-none text-vs-text-primary">{s.name}</span>
                  <span className="min-w-0 flex-1 truncate text-vs-text-secondary">{s.decision}</span>
                </div>
              ))}
              {run.artifacts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-vs-border-default pt-2.5">
                  <span className="mr-0.5 text-[11px] text-vs-text-muted">artifacts</span>
                  {run.artifacts.map((a) => (
                    <span
                      key={a}
                      className="rounded border border-vs-border-default bg-vs-bg-primary px-1.5 py-px font-mono text-[11px] text-vs-text-secondary"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutcomeIcon({ outcome }: { outcome: RunSummary["outcome"] }): React.JSX.Element {
  if (outcome === "running") return <Spinner />;
  if (outcome === "passed") return <span className="text-xs text-vs-success">✓</span>;
  if (outcome === "cancelled" || outcome === "failed")
    return <span className="text-xs text-vs-error">✕</span>;
  if (outcome === "in-review") return <span className="h-[7px] w-[7px] rounded-full bg-vs-warning" />;
  return <span className="h-[7px] w-[7px] rounded-full bg-vs-text-muted" />;
}

function StageIcon({ status }: { status: RunStageSummary["status"] }): React.JSX.Element {
  const map = {
    done: { icon: "✓", cls: "text-vs-success" },
    review: { icon: "◆", cls: "text-vs-warning" },
    cancelled: { icon: "✕", cls: "text-vs-error" },
    pending: { icon: "·", cls: "text-vs-text-muted" },
  } as const;
  const m = map[status];
  return <span className={`w-3.5 flex-none text-center ${m.cls}`}>{m.icon}</span>;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then) || then === 0) return "—";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
