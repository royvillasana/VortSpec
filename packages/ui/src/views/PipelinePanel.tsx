import { useEffect, useState } from "react";
import type { Flow, StageDef, StageState, StageStatus } from "@vortspec/core/flow";
import { DEFAULT_FLOW } from "@vortspec/core/flow";
import type { Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Spinner } from "@vortspec/ui/ui";

/**
 * SDD-DE pipeline panel (IDE milestone I6.7.1). A read-first surface that shows
 * the guided-flow stages — foundation → build → verify → docs (`DESIGN.md`) →
 * commit — with their file-derived status. It holds NO pipeline logic: the
 * stage definitions and live state both come from `@vortspec/core` via
 * `api.getFlow`, so the same panel renders identically in the cockpit and the
 * IDE, and any edit to `DEFAULT_FLOW` in core shows up in both apps (parity).
 */

const STATUS: Record<StageStatus, { label: string; dot: string; text: string }> = {
  pending: { label: "Pending", dot: "bg-vs-text-muted", text: "text-vs-text-muted" },
  running: { label: "Running", dot: "bg-vs-accent", text: "text-vs-accent" },
  "needs-review": { label: "Needs review", dot: "bg-vs-warning", text: "text-vs-warning" },
  approved: { label: "Approved", dot: "bg-vs-success", text: "text-vs-success" },
  failed: { label: "Failed", dot: "bg-vs-error", text: "text-vs-error" },
};

export function PipelinePanel({
  project,
  onOpenManifest,
  onOpenTokens,
}: {
  project: Project;
  /** Jump to the Design manifest panel (the `DESIGN.md` stage's artifact). */
  onOpenManifest?: () => void;
  /** Jump to the Design tokens / Inspector (the design-system stage's output). */
  onOpenTokens?: () => void;
}): React.JSX.Element {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void api.getFlow(project.path).then((f) => {
      if (!live) return;
      setFlow(f);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [project.path]);

  // Always render the pipeline shape: definitions come from core (falling back
  // to DEFAULT_FLOW before the project has a flow.json), state overlays status.
  const definitions: StageDef[] = flow?.definitions ?? DEFAULT_FLOW;
  const byId = new Map<string, StageState>((flow?.state.stages ?? []).map((s) => [s.id, s]));
  const currentId = flow?.state.currentStageId ?? definitions[0]?.id;
  const required = definitions.filter((d) => !d.optional);
  const approvedCount = required.filter((d) => byId.get(d.id)?.status === "approved").length;

  function jumpFor(def: StageDef): (() => void) | undefined {
    if (def.kind === "manifest") return onOpenManifest;
    if (def.kind === "source" || def.kind === "components") return onOpenTokens;
    return undefined;
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-vs-bg-primary">
      <header className="flex flex-none flex-col gap-1 border-b border-vs-border-default px-6 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">SDD-DE pipeline</h1>
          {!loading && (
            <span className="font-mono text-xs text-vs-text-muted">
              {approvedCount}/{required.length} stages approved
            </span>
          )}
        </div>
        <p className="text-xs text-vs-text-secondary">
          The same spec-first cycle the cockpit runs — defined in{" "}
          <span className="font-mono text-vs-text-muted">@vortspec/core</span>. Each gated stage needs
          your approval before the flow advances.
        </p>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-vs-text-muted">
          <Spinner />
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto px-6 py-4">
          {definitions.map((def, i) => {
            const status = byId.get(def.id)?.status ?? "pending";
            const s = STATUS[status];
            const notes = byId.get(def.id)?.decisionNotes;
            const isCurrent = def.id === currentId;
            const jump = jumpFor(def);
            const artifact = def.artifact ?? (def.artifactGlob ? `specs/…/${def.artifactGlob}` : null);
            return (
              <li
                key={def.id}
                className={`relative flex gap-3 rounded-lg border px-4 py-3 ${
                  i > 0 ? "mt-2" : ""
                } ${
                  isCurrent
                    ? "border-vs-accent bg-vs-bg-elevated"
                    : "border-vs-border-default bg-vs-bg-surface"
                }`}
              >
                <div className="flex flex-none flex-col items-center gap-1 pt-0.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
                  <span className="font-mono text-[10px] text-vs-text-muted">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-vs-text-primary">{def.title}</h2>
                    {def.gated && (
                      <span
                        title="Gated — requires your approval to advance"
                        className="rounded-full border border-vs-border-default px-1.5 py-px text-[10px] text-vs-text-muted"
                      >
                        gated
                      </span>
                    )}
                    {def.optional && (
                      <span className="rounded-full border border-vs-border-default px-1.5 py-px text-[10px] text-vs-text-muted">
                        optional
                      </span>
                    )}
                    <span className={`ml-auto text-[11px] ${s.text}`}>{s.label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-vs-text-secondary">{def.summary}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {artifact && (
                      <span className="font-mono text-[11px] text-vs-text-muted">{artifact}</span>
                    )}
                    {jump && (
                      <button
                        type="button"
                        onClick={jump}
                        className="text-[11px] text-vs-accent hover:underline"
                      >
                        Open →
                      </button>
                    )}
                  </div>
                  {notes && (
                    <p className="mt-1.5 rounded border border-vs-warning/40 bg-vs-bg-elevated px-2 py-1 text-[11px] text-vs-text-secondary">
                      Requested changes: {notes}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
