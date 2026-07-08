import { useEffect, useMemo, useState } from "react";
import type { Flow, FindingSeverity, Project, VerificationFinding } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { ProjectRail, ReviewBadge, projectRailItems } from "@vortspec/ui/ProjectRail";

type Sev = FindingSeverity | "all";
const SEV_COLOR: Record<FindingSeverity, string> = {
  error: "#E5484D",
  warning: "#FFB224",
  info: "#6B7280",
};
const GROUP_TITLE = { visual: "Visual verify", adversarial: "Adversarial review" } as const;

/**
 * Verification (design: "Verification.dc.html", adapted to v2) — aggregates the
 * findings from the project's visual-verify + adversarial-review reports, grouped
 * and severity-filterable. Open findings can be sent back to Claude Code (routed
 * as revision guidance on the visual-verify stage). Read from real report files.
 */
export function Verification({
  project,
  onBack,
  onOpenRun,
  onOpenPreview,
  onOpenInspector,
  onOpenHistory,
  onOpenManifest,
}: {
  project: Project;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenPreview: () => void;
  onOpenInspector: () => void;
  onOpenHistory: () => void;
  onOpenManifest: () => void;
}): React.JSX.Element {
  const [findings, setFindings] = useState<VerificationFinding[] | null>(null);
  const [verifyStageId, setVerifyStageId] = useState<string | null>(null);
  const [sev, setSev] = useState<Sev>("all");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  useEffect(() => {
    void api.getVerification(project.path).then((r) => setFindings(r.findings));
    void api.getFlow(project.path).then((f: Flow) => {
      setVerifyStageId(f.definitions.find((d) => d.kind === "verify")?.id ?? null);
    });
  }, [project.path]);

  function flash(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function sendBack(f: VerificationFinding): Promise<void> {
    if (verifyStageId) {
      await api.requestChanges(project.path, verifyStageId, `Fix ${f.rawId} (${f.component}): ${f.title}`);
    }
    setSent((prev) => new Set(prev).add(f.id));
    flash(`${f.rawId} sent back to the agent`);
  }

  const effective = (f: VerificationFinding): "open" | "resolved" | "sent" =>
    sent.has(f.id) ? "sent" : f.status;

  const openErrors = useMemo(
    () => (findings ?? []).filter((f) => f.severity === "error" && effective(f) === "open").length,
    [findings, sent],
  );
  const openTotal = useMemo(
    () => (findings ?? []).filter((f) => effective(f) === "open").length,
    [findings, sent],
  );

  const groups = useMemo(() => {
    if (!findings) return [];
    const shown = findings.filter((f) => sev === "all" || f.severity === sev);
    return (["visual", "adversarial"] as const)
      .map((g) => {
        const all = findings.filter((f) => f.group === g);
        return {
          group: g,
          items: shown.filter((f) => f.group === g),
          open: all.filter((f) => effective(f) === "open").length,
          total: all.length,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [findings, sev, sent]);

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems(
          "flow",
          {
            onFlow: onBack,
            onRun: onOpenRun,
            onPlayground: onOpenPreview,
            onTokens: onOpenInspector,
            onManifest: onOpenManifest,
            onHistory: onOpenHistory,
          },
          { flow: openTotal ? <ReviewBadge /> : undefined },
        )}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none flex-col gap-3.5 border-b border-vs-border-default px-7 pb-3.5 pt-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Verification</h1>
            <span className="font-mono text-xs text-vs-text-muted">visual-verify + adversarial review</span>
            <div className="flex-1" />
            <span className={`font-mono text-xs ${openTotal ? "text-vs-warning" : "text-vs-success"}`}>
              {findings === null ? "" : openTotal ? `${openTotal} open · ${openErrors} blocking` : "all resolved"}
            </span>
          </div>
          <div className="flex gap-0.5 self-start rounded-lg border border-vs-border-default bg-vs-bg-surface p-0.5">
            {(["all", "error", "warning", "info"] as Sev[]).map((s) => (
              <button
                key={s}
                onClick={() => setSev(s)}
                className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${
                  sev === s ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:text-vs-text-primary"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          <div className="mx-auto flex max-w-[720px] flex-col gap-6">
            {findings === null ? (
              <div className="flex items-center gap-2 text-sm text-vs-text-secondary">
                <Spinner /> Reading reports…
              </div>
            ) : findings.length === 0 ? (
              <div className="rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-12 text-center text-sm text-vs-text-muted">
                No verification results yet. Run <span className="font-mono">/visual-verify</span> (and
                adversarial review) to populate findings here.
              </div>
            ) : groups.length === 0 ? (
              <div className="py-12 text-center text-sm text-vs-text-muted">No findings at this severity.</div>
            ) : (
              groups.map((g) => (
                <section key={g.group} className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{GROUP_TITLE[g.group]}</span>
                    <span className="font-mono text-[11px] text-vs-text-muted">
                      {g.open} open · {g.total} total
                    </span>
                  </div>
                  {g.items.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      state={effective(f)}
                      canSend={Boolean(verifyStageId)}
                      onSend={() => void sendBack(f)}
                    />
                  ))}
                </section>
              ))
            )}
          </div>
        </div>

        {findings !== null && findings.length > 0 && (
          <div className="flex flex-none items-center gap-3.5 border-t border-vs-border-default bg-vs-bg-surface px-7 py-3">
            {openErrors > 0 ? (
              <>
                <span className="flex-1 text-xs text-vs-text-secondary">
                  {openErrors} blocking error{openErrors === 1 ? "" : "s"} left · resolve to finish the run.
                </span>
                <Button variant="ghost" onClick={onBack}>
                  Back to flow
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-xs text-vs-success">✓ No blocking findings — errors resolved.</span>
                <Button variant="primary" onClick={onOpenPreview}>
                  Finish &amp; preview →
                </Button>
              </>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-vs-border-strong bg-vs-bg-elevated px-4 py-2.5 text-xs text-vs-text-primary shadow-lg">
          <span className="text-vs-success">✓</span>
          <span className="font-mono">{toast}</span>
        </div>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  state,
  canSend,
  onSend,
}: {
  finding: VerificationFinding;
  state: "open" | "resolved" | "sent";
  canSend: boolean;
  onSend: () => void;
}): React.JSX.Element {
  const isErrorOpen = finding.severity === "error" && state === "open";
  const dot = state === "open" ? SEV_COLOR[finding.severity] : "#30A46C";
  return (
    <div
      className="overflow-hidden rounded-lg border bg-vs-bg-surface"
      style={{
        borderColor: isErrorOpen ? "rgba(229,72,77,0.35)" : "#26282D",
        boxShadow: isErrorOpen ? "inset 2px 0 0 #E5484D" : "none",
      }}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium text-vs-text-primary">{finding.title}</span>
            <span
              className="font-mono text-[10px] uppercase tracking-wide"
              style={{ color: SEV_COLOR[finding.severity] }}
            >
              {finding.severity}
            </span>
          </div>
          {finding.detail && (
            <p className="mt-1.5 text-xs leading-relaxed text-vs-text-secondary">{finding.detail}</p>
          )}
          {finding.ref && (
            <span className="mt-2 inline-block rounded border border-vs-border-default bg-vs-bg-primary px-2 py-0.5 font-mono text-[11px] text-vs-text-secondary">
              {finding.ref}
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-vs-text-muted">{finding.rawId}</span>
      </div>

      {state === "open" && (
        <div className="flex items-center gap-2 border-t border-vs-border-default px-4 py-2.5">
          <span className="flex-1 text-[11px] text-vs-text-muted">
            {finding.severity === "error"
              ? "Blocks finishing the run until resolved."
              : "Non-blocking — send back to the agent or leave as noted."}
          </span>
          <Button variant="default" disabled={!canSend} onClick={onSend}>
            Send back
          </Button>
        </div>
      )}
      {state === "resolved" && (
        <div className="flex items-center gap-2 border-t border-vs-border-default px-4 py-2.5">
          <span className="text-xs text-vs-success">✓</span>
          <span className="text-xs text-vs-text-secondary">Resolved in the report.</span>
        </div>
      )}
      {state === "sent" && (
        <div className="flex items-center gap-2 border-t border-vs-border-default px-4 py-2.5">
          <Spinner />
          <span className="text-xs text-vs-text-secondary">
            Sent back to the agent — re-run the verify stage to pick up the fix.
          </span>
        </div>
      )}
    </div>
  );
}
