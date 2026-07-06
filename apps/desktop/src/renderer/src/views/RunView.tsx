import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../shared/ipc";
import type { Activity, RunModel, RunStatus } from "../lib/run-model";
import { useLatestRun } from "../lib/useAgentRun";
import { Button, Spinner } from "../components/ui";
import { ProjectRail } from "../components/ProjectRail";

/**
 * Run View (design: "Run View.dc.html", adapted to v2) — a full-screen live
 * mirror of the currently-active Claude Code run: status header, progress,
 * a files-touched checklist + friendly activity stream, and a raw stream-json
 * terminal toggle. Passive observer; the run is driven from a flow stage.
 */
export function RunView({
  project,
  onBack,
  onOpenPreview,
  onOpenInspector,
}: {
  project: Project;
  onBack: () => void;
  onOpenPreview: () => void;
  onOpenInspector: () => void;
}): React.JSX.Element {
  const { model, running, hasRun, cancel } = useLatestRun();
  const [term, setTerm] = useState(false);
  const badge = STATUS_BADGE[model.status];

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={[
          { label: "Flow", onClick: onBack },
          {
            label: "Run",
            active: true,
            badge: running ? <span className="h-1.5 w-1.5 rounded-full bg-vs-accent" /> : undefined,
          },
          { label: "Preview", onClick: onOpenPreview },
          { label: "Tokens", onClick: onOpenInspector },
        ]}
      />

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-[-0.01em]">Run</h1>
              <span
                className="rounded-full border px-2 py-px font-mono text-[11px]"
                style={{ color: badge.color, borderColor: badge.border, background: badge.bg }}
              >
                {badge.label}
              </span>
            </div>
            <span className="font-mono text-[11px] text-vs-text-muted">
              claude -p --output-format stream-json{model.model ? ` · ${model.model}` : ""}
            </span>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setTerm((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs font-medium hover:border-vs-accent ${
              term ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary"
            }`}
          >
            {term ? "Friendly view" : "Show terminal"}
          </button>
          {running && (
            <Button onClick={() => void cancel()} className="!border-vs-error/40 !text-vs-error">
              Cancel run
            </Button>
          )}
        </header>

        {/* progress */}
        <div className="flex flex-none items-center gap-4 border-b border-vs-border-default px-6 py-3.5">
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              {running ? (
                <Spinner />
              ) : model.status === "done" ? (
                <span className="text-xs text-vs-success">✓</span>
              ) : model.status === "error" || model.status === "canceled" ? (
                <span className="text-xs text-vs-error">✕</span>
              ) : null}
              <span className="text-[13px] text-vs-text-primary">{currentLabel(model)}</span>
            </div>
            <ProgressBar status={model.status} />
          </div>
          <span className="font-mono text-xs text-vs-text-secondary">
            {model.files.length} files · {model.activity.length} actions
          </span>
        </div>

        {/* body */}
        <div className="flex min-h-0 flex-1">
          {!hasRun ? (
            <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-vs-text-muted">
              No active run. Start a step in the Flow and it will stream here live.
            </div>
          ) : term ? (
            <RawTerminal lines={model.raw} running={running} />
          ) : (
            <>
              <div className="w-64 shrink-0 overflow-y-auto border-r border-vs-border-default p-4">
                <p className="px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
                  Files touched
                </p>
                {model.files.length === 0 ? (
                  <p className="px-1 text-xs text-vs-text-muted">No files yet.</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {model.files.map((f) => (
                      <div key={f} className="flex items-center gap-2 rounded-md px-1.5 py-1.5">
                        <span className="text-xs text-vs-success">✓</span>
                        <span className="truncate font-mono text-[11px] text-vs-text-secondary" title={f}>
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <ActivityStream model={model} running={running} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const STATUS_BADGE: Record<RunStatus, { label: string; color: string; border: string; bg: string }> = {
  idle: { label: "idle", color: "#6B7280", border: "#26282D", bg: "#0B0C0E" },
  running: { label: "running", color: "#7C6FF0", border: "rgba(124,111,240,0.4)", bg: "rgba(124,111,240,0.08)" },
  done: { label: "complete", color: "#30A46C", border: "rgba(48,164,108,0.35)", bg: "rgba(48,164,108,0.08)" },
  error: { label: "failed", color: "#E5484D", border: "rgba(229,72,77,0.4)", bg: "rgba(229,72,77,0.06)" },
  canceled: { label: "canceled", color: "#E5484D", border: "rgba(229,72,77,0.4)", bg: "rgba(229,72,77,0.06)" },
};

function currentLabel(model: RunModel): string {
  if (model.status === "running") {
    const last = model.activity[model.activity.length - 1];
    return last ? last.label : "Working…";
  }
  if (model.status === "done") return "Run complete";
  if (model.status === "canceled") return "Run canceled — child process killed cleanly";
  if (model.status === "error") return model.result?.text?.slice(0, 90) ?? "Run failed";
  return "Ready";
}

function ProgressBar({ status }: { status: RunStatus }): React.JSX.Element {
  if (status === "running") {
    return (
      <div className="h-1 overflow-hidden rounded-full bg-vs-border-default">
        <div className="h-full w-1/3 rounded-full bg-vs-accent animate-[vsSlide_1.2s_ease-in-out_infinite]" />
      </div>
    );
  }
  const color =
    status === "done" ? "bg-vs-success" : status === "error" || status === "canceled" ? "bg-vs-error" : "bg-vs-border-default";
  const width = status === "idle" ? "0%" : "100%";
  return (
    <div className="h-1 overflow-hidden rounded-full bg-vs-border-default">
      <div className={`h-full rounded-full ${color}`} style={{ width }} />
    </div>
  );
}

function ActivityStream({ model, running }: { model: RunModel; running: boolean }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [model.activity.length, model.streamingText]);
  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-5">
      {model.mcpErrors.length > 0 && (
        <div className="mb-3 rounded-md border border-vs-warning-border bg-vs-warning-muted px-3 py-2 text-xs text-vs-warning">
          MCP issue: {model.mcpErrors.join("; ")}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {model.activity.map((a) => {
          const t = tagInfo(a);
          return (
            <div key={a.key} className="flex items-start gap-2.5 py-1">
              <span
                className="w-14 shrink-0 rounded border py-px text-center font-mono text-[10px]"
                style={{ color: t.color, borderColor: t.border }}
              >
                {t.tag}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-relaxed text-vs-text-secondary">
                {a.label}
              </span>
            </div>
          );
        })}
        {running && model.streamingText && (
          <div className="flex items-start gap-2.5 py-1">
            <span className="w-14 shrink-0 rounded border border-vs-border-default py-px text-center font-mono text-[10px] text-vs-text-muted">
              think
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-vs-text-muted">
              {model.streamingText}
            </span>
          </div>
        )}
        {running && (
          <span className="ml-[62px] mt-1 inline-block h-3 w-1.5 bg-vs-accent animate-[vsBlink_1s_step-end_infinite]" />
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function RawTerminal({ lines, running }: { lines: string[]; running: boolean }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines.length]);
  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-black/60 p-5 font-mono text-xs leading-relaxed">
      {lines.length === 0 ? (
        <span className="text-vs-text-muted">Raw stream-json output will appear here…</span>
      ) : (
        lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap text-vs-text-secondary">
            {l}
          </div>
        ))
      )}
      {running && (
        <span className="inline-block h-3.5 w-[7px] align-[-2px] bg-vs-accent animate-[vsBlink_1s_step-end_infinite]" />
      )}
      <div ref={endRef} />
    </div>
  );
}

/** Map a run activity to a colored tag chip (write=green, edit=accent, bash=amber, …). */
function tagInfo(a: Activity): { tag: string; color: string; border: string } {
  if (a.tone === "error") return { tag: "error", color: "#E5484D", border: "rgba(229,72,77,0.4)" };
  if (a.tone === "retry") return { tag: "retry", color: "#FFB224", border: "rgba(255,178,36,0.4)" };
  if (a.tone === "notice") return { tag: "note", color: "#6B7280", border: "#26282D" };
  const name = a.label.split(/[\s·]/)[0].toLowerCase();
  const map: Record<string, [string, string]> = {
    write: ["#30A46C", "rgba(48,164,108,0.35)"],
    edit: ["#7C6FF0", "rgba(124,111,240,0.4)"],
    read: ["#9BA1AB", "#26282D"],
    bash: ["#FFB224", "rgba(255,178,36,0.4)"],
    multiedit: ["#7C6FF0", "rgba(124,111,240,0.4)"],
  };
  const hit = map[name];
  return { tag: name.slice(0, 6) || "tool", color: hit?.[0] ?? "#9BA1AB", border: hit?.[1] ?? "#26282D" };
}

