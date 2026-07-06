import { useEffect, useState } from "react";
import type { Flow, Project, StageDef, StageState, StageStatus } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button, Spinner } from "../components/ui";
import { Markdown } from "../components/Markdown";

/**
 * Artifact Review (design: "Artifact Review.dc.html", adapted to v2) — the
 * dedicated approval surface for a gated stage's artifact: the document rendered
 * as formatted Markdown + a sticky gate bar (review / requesting / approved).
 * Reads and mutates the real flow; nothing advances without an approval.
 */
export function ArtifactReview({
  project,
  onBack,
  onOpenRun,
  onOpenPreview,
  onOpenInspector,
}: {
  project: Project;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenPreview: () => void;
  onOpenInspector: () => void;
}): React.JSX.Element {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [content, setContent] = useState<string | null | undefined>(undefined);
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<"review" | "requesting" | "approved">("review");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.getFlow(project.path).then(setFlow);
  }, [project.path]);

  // The stage under review: the needs-review one, else the current stage.
  const stage = flow ? pickReviewStage(flow) : null;
  const def = stage?.def;
  const state = stage?.state;

  useEffect(() => {
    if (!def) return;
    const resolve = def.artifactGlob
      ? api.findLatestArtifact(project.path, def.artifactGlob)
      : def.artifact
        ? api
            .readArtifact(project.path, def.artifact)
            .then((c) => (c === null ? null : { path: def.artifact!, content: c }))
        : Promise.resolve(null);
    void resolve.then((r) => {
      setContent(r?.content ?? null);
      setPath(r?.path ?? def.artifact ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.id]);

  async function approve(): Promise<void> {
    if (!def) return;
    setBusy(true);
    setFlow(await api.approveStage(project.path, def.id));
    setBusy(false);
    setMode("approved");
  }
  async function sendRequest(): Promise<void> {
    if (!def || !note.trim()) return;
    setBusy(true);
    await api.requestChanges(project.path, def.id, note.trim());
    setBusy(false);
    onBack();
  }

  const approved = mode === "approved" || state?.status === "approved";
  const badge = STATUS_BADGE[approved ? "approved" : (state?.status ?? "needs-review")];

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <nav className="flex w-52 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface p-3">
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-2 border-b border-vs-border-default px-2 pb-3 text-left hover:opacity-85"
        >
          <span className="grid h-5 w-5 place-items-center rounded-md bg-vs-accent font-mono text-[11px] font-medium text-vs-bg-primary">
            {project.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{project.name}</span>
            <span className="block truncate font-mono text-[11px] text-vs-text-muted">
              {project.path}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2.5 rounded-md bg-vs-bg-elevated px-2 py-1.5 text-[13px] font-medium text-vs-accent">
          <span className="flex-1">Flow</span>
          {!approved && (
            <span className="rounded-full border border-vs-warning-border px-1.5 font-mono text-[10px] text-vs-warning">
              review
            </span>
          )}
        </div>
        <Rail label="Run" onClick={onOpenRun} />
        <Rail label="Preview" onClick={onOpenPreview} />
        <Rail label="Tokens" onClick={onOpenInspector} />
      </nav>

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-8 py-4">
          <button onClick={onBack} className="text-[13px] text-vs-text-muted hover:text-vs-text-primary">
            Flow
          </button>
          <span className="text-vs-text-muted">/</span>
          <span className="text-[15px] font-semibold">{def?.title ?? "Artifact"}</span>
          {path && (
            <span className="rounded border border-vs-border-default px-1.5 py-px font-mono text-[11px] text-vs-text-secondary">
              {path.split("/").pop()}
            </span>
          )}
          <span
            className="rounded-full border px-2 py-px font-mono text-[11px]"
            style={{ color: badge.color, borderColor: badge.border, background: badge.bg }}
          >
            {badge.label}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <article className="mx-auto max-w-[720px] px-8 py-9">
            {content === undefined ? (
              <div className="flex items-center gap-2 text-sm text-vs-text-secondary">
                <Spinner /> Loading artifact…
              </div>
            ) : content === null ? (
              <div className="rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-10 text-center text-sm text-vs-text-muted">
                No artifact found for this stage yet. Run the step to produce one, then return here.
              </div>
            ) : (
              <Markdown text={content} />
            )}
          </article>
        </div>

        {/* sticky gate bar */}
        {content !== null && (
          <div className="flex-none border-t border-vs-border-default bg-vs-bg-surface px-8 py-3.5">
            {approved ? (
              <div className="flex items-center gap-3">
                <span className="text-vs-success">✓</span>
                <span className="flex-1 text-[13px] text-vs-text-primary">
                  Approved. The next stages are unlocked.
                </span>
                <Button variant="ghost" onClick={onBack}>
                  Back to flow
                </Button>
                <Button variant="primary" onClick={onOpenRun}>
                  Go to run →
                </Button>
              </div>
            ) : mode === "requesting" ? (
              <div className="flex flex-col gap-2.5">
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Add an expired-card error state, and make email required for the receipt."
                  className="w-full resize-none rounded-md border border-vs-border-strong bg-vs-bg-primary px-3 py-2.5 text-[13px] leading-relaxed text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
                />
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-[11px] text-vs-text-muted">
                    Sent to Claude Code as revision guidance for this stage.
                  </span>
                  <Button variant="ghost" onClick={() => setMode("review")}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={note.trim().length === 0 || busy}
                    onClick={() => void sendRequest()}
                  >
                    Send &amp; revise
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3.5">
                <span className="flex-1 text-xs text-vs-text-secondary">
                  Nothing advances without your approval. Request changes to send notes back to the agent.
                </span>
                <Button variant="default" onClick={() => setMode("requesting")}>
                  Request changes
                </Button>
                <Button variant="primary" disabled={busy} onClick={() => void approve()}>
                  Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const STATUS_BADGE: Record<
  StageStatus,
  { label: string; color: string; border: string; bg: string }
> = {
  approved: { label: "approved", color: "#30A46C", border: "rgba(48,164,108,0.35)", bg: "rgba(48,164,108,0.08)" },
  running: { label: "revising", color: "#7C6FF0", border: "rgba(124,111,240,0.4)", bg: "rgba(124,111,240,0.08)" },
  "needs-review": { label: "needs review", color: "#FFB224", border: "rgba(255,178,36,0.4)", bg: "rgba(255,178,36,0.08)" },
  pending: { label: "pending", color: "#6B7280", border: "#26282D", bg: "#0B0C0E" },
  failed: { label: "failed", color: "#E5484D", border: "rgba(229,72,77,0.4)", bg: "rgba(229,72,77,0.06)" },
};

function pickReviewStage(flow: Flow): { def: StageDef; state: StageState } | null {
  const byId = (id: string): StageState | undefined => flow.state.stages.find((s) => s.id === id);
  const review = flow.definitions.find((d) => byId(d.id)?.status === "needs-review");
  const target = review ?? flow.definitions.find((d) => d.id === flow.state.currentStageId);
  if (!target) return null;
  return { def: target, state: byId(target.id)! };
}

function Rail({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
    >
      <span className="flex-1">{label}</span>
    </button>
  );
}
