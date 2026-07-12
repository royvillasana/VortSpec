import { useEffect, useState } from "react";
import type { CheckStatus, EnvCheck, EnvReport } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { FigmaConnection } from "@vortspec/ui/FigmaConnection";
import { FirstRunSetup } from "@vortspec/ui/FirstRunSetup";

/**
 * The onboarding environment gate (US-01). Renders each check as a pass/fail
 * row with a fix action. Node/git/Claude-install are probed automatically; the
 * login row is verified on demand so a scan never spends the user's usage.
 */
export function EnvironmentCheck({
  report,
  onReport,
  onContinue,
  coreReady,
}: {
  report: EnvReport;
  onReport: (r: EnvReport) => void;
  onContinue: () => void;
  coreReady: boolean;
}): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [guided, setGuided] = useState(false);

  async function recheck(): Promise<void> {
    setBusy("recheck");
    try {
      onReport(await api.checkEnvironment());
    } finally {
      setBusy(null);
    }
  }

  async function verifyLogin(): Promise<void> {
    setBusy("claude-login");
    // optimistic "checking" state
    onReport(patchCheck(report, "claude-login", { status: "checking" }));
    try {
      const login = await api.verifyLogin();
      onReport(patchCheck(report, "claude-login", login));
    } finally {
      setBusy(null);
    }
  }

  async function verifyFigma(): Promise<void> {
    setBusy("figma-mcp");
    onReport(patchCheck(report, "figma-mcp", { status: "checking" }));
    try {
      onReport(patchCheck(report, "figma-mcp", await api.verifyFigmaMcp()));
    } finally {
      setBusy(null);
    }
  }

  // The Figma MCP check reads MCP config only (no Claude usage), so verify it
  // automatically whenever the environment screen is shown.
  useEffect(() => {
    void verifyFigma();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runFix(check: EnvCheck): Promise<void> {
    if (!check.fix) return;
    if (check.fix.kind === "install-link" && check.fix.url) {
      await api.openInstall(check.fix.url);
      return;
    }
    if (check.id === "figma-mcp") {
      await verifyFigma();
      return;
    }
    if (check.fix.kind === "verify" || check.fix.kind === "open-login") {
      await verifyLogin();
    }
  }

  const total = report.checks.length;
  const passing = report.checks.filter((c) => c.status === "pass").length;
  const failing = report.checks.filter((c) => c.status === "fail").length;
  const summary =
    failing > 0
      ? `${passing} / ${total} · ${failing} need${failing === 1 ? "s" : ""} attention`
      : `${passing} / ${total} passing`;
  const summaryColor =
    failing > 0 ? "text-vs-warning" : passing === total ? "text-vs-success" : "text-vs-text-secondary";

  const claudeCheck = report.checks.find((c) => c.id === "claude-login");
  const figmaCheck = report.checks.find((c) => c.id === "figma-mcp");
  const needsGuidedSetup =
    claudeCheck?.status === "fail" || figmaCheck?.status === "fail";

  // The guided first-run wizard: opens an embedded terminal, drives Claude
  // sign-in into it, and connects Figma — then re-checks and returns here.
  if (guided) {
    return (
      <div className="h-full min-h-0">
        <FirstRunSetup
          onDone={() => {
            setGuided(false);
            void recheck();
          }}
          onSkip={() => {
            setGuided(false);
            void recheck();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-7 px-6 pb-16 pt-11">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-vs-text-primary">
          Set up VortSpec
        </h1>
        <p className="text-[13px] leading-relaxed text-vs-text-secondary">
          VortSpec is a cockpit for Claude Code running the Spec-Driven Design Engineering workflow
          on your machine. Let&rsquo;s confirm your environment is ready.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Environment
          </span>
          <span className={`font-mono text-[11px] ${summaryColor}`}>{summary}</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-surface">
          {report.checks.map((check, i) => (
            <div
              key={check.id}
              className={`flex items-center gap-3.5 px-4 py-3.5 ${
                i < total - 1 ? "border-b border-vs-border-default" : ""
              }`}
              style={{ boxShadow: rowEdge(check.status) }}
            >
              <span className="flex w-5 flex-none items-center justify-center">
                <RowIcon status={check.status} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-vs-text-primary">{check.label}</div>
                <div className={`mt-0.5 truncate font-mono text-xs ${detailColor(check.status)}`}>
                  {check.detail}
                </div>
              </div>
              {check.fix && (
                <Button
                  variant="default"
                  disabled={busy === check.id}
                  onClick={() => void runFix(check)}
                >
                  {busy === check.id ? "Checking…" : check.fix.label}
                </Button>
              )}
            </div>
          ))}
        </div>

        {needsGuidedSetup && (
          <div className="flex items-center gap-3 rounded-lg border border-vs-accent/40 bg-vs-accent/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-vs-text-primary">
                Guided setup
              </div>
              <div className="mt-0.5 text-xs leading-relaxed text-vs-text-secondary">
                Open an embedded terminal to sign in to Claude Code and connect Figma — no
                credentials stored, no app restart.
              </div>
            </div>
            <Button variant="primary" onClick={() => setGuided(true)}>
              Start guided setup
            </Button>
          </div>
        )}
        {claudeCheck?.status === "fail" && (
          <p className="text-xs text-vs-text-muted">
            Prefer to do it yourself? Run <code className="text-vs-text-secondary">claude</code> in a
            terminal, sign in with <code className="text-vs-text-secondary">/login</code>, then
            re-check.
          </p>
        )}
        {figmaCheck?.status === "fail" && (
          <p className="text-xs text-vs-text-muted">
            Figma designs are read through your Claude Code&rsquo;s Figma MCP. Only needed for Figma
            design sources.
          </p>
        )}
      </div>

      {/* Primary Figma connection: the local figma-cli (bridge + token fallback). */}
      <FigmaConnection />

      <div className="flex items-center gap-4 border-t border-vs-border-default pt-5">
        <span className="flex-1 text-[11px] leading-relaxed text-vs-text-muted">
          No VortSpec account. No telemetry without opt-in. No provider keys, ever — authentication
          and usage belong to your Claude Code install.
        </span>
        <Button variant="ghost" disabled={busy === "recheck"} onClick={() => void recheck()}>
          {busy === "recheck" ? "Re-checking…" : "Re-check"}
        </Button>
        <Button
          variant="primary"
          disabled={!coreReady}
          title={coreReady ? undefined : "Install the required tools first"}
          onClick={onContinue}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}

function RowIcon({ status }: { status: CheckStatus }): React.JSX.Element {
  if (status === "pass") return <span className="text-sm text-vs-success">✓</span>;
  if (status === "fail") return <span className="text-sm text-vs-error">✕</span>;
  if (status === "checking") return <Spinner />;
  return <span className="h-2 w-2 rounded-full bg-vs-warning" />;
}

function rowEdge(status: CheckStatus): string {
  if (status === "fail") return "inset 2px 0 0 #E5484D";
  if (status === "checking") return "inset 2px 0 0 #7C6FF0";
  return "none";
}

function detailColor(status: CheckStatus): string {
  if (status === "fail") return "text-vs-error";
  if (status === "checking") return "text-vs-text-primary";
  if (status === "pass") return "text-vs-text-secondary";
  return "text-vs-text-muted";
}

function patchCheck(
  report: EnvReport,
  id: EnvCheck["id"],
  patch: Partial<EnvCheck>,
): EnvReport {
  const checks = report.checks.map((c) => (c.id === id ? { ...c, ...patch } : c));
  return { checks, ready: checks.every((c) => c.status === "pass") };
}
