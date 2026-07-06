import { useEffect, useState } from "react";
import type { EnvCheck, EnvReport } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button, Card, StatusDot, statusLabelClass } from "../components/ui";

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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-vs-text-primary">
          Environment check
        </h2>
        <p className="text-sm text-vs-text-secondary">
          VortSpec drives your own Claude Code. Let&rsquo;s make sure everything
          it needs is present.
        </p>
      </header>

      <Card>
        <ul className="divide-y divide-vs-border-subtle">
          {report.checks.map((check) => (
            <li key={check.id} className="flex items-center gap-3 px-4 py-3">
              <StatusDot status={check.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-vs-text-primary">
                  {check.label}
                </p>
                <p className={`truncate text-xs ${statusLabelClass(check.status)}`}>
                  {check.detail}
                </p>
              </div>
              {check.fix && (
                <Button
                  variant={check.status === "fail" ? "primary" : "default"}
                  disabled={busy === check.id}
                  onClick={() => void runFix(check)}
                >
                  {busy === check.id ? "Checking…" : check.fix.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {report.checks.find((c) => c.id === "claude-login")?.status === "fail" && (
        <p className="text-xs text-vs-text-muted">
          Log in with Claude Code (run <code className="text-vs-text-secondary">claude</code>{" "}
          in a terminal and use <code className="text-vs-text-secondary">/login</code>), then
          verify. An embedded login terminal arrives in the next milestone.
        </p>
      )}

      {report.checks.find((c) => c.id === "figma-mcp")?.status === "fail" && (
        <p className="text-xs text-vs-text-muted">
          Figma designs are read through your Claude Code&rsquo;s Figma MCP. Connect it at{" "}
          <code className="text-vs-text-secondary">claude.ai/customize/connectors</code> (or add one
          with <code className="text-vs-text-secondary">claude mcp add</code>), then re-check. Only
          needed for Figma design sources.
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={busy === "recheck"} onClick={() => void recheck()}>
          {busy === "recheck" ? "Re-checking…" : "Re-check"}
        </Button>
        <Button
          variant="primary"
          disabled={!coreReady}
          title={coreReady ? undefined : "Install the required tools first"}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function patchCheck(
  report: EnvReport,
  id: EnvCheck["id"],
  patch: Partial<EnvCheck>,
): EnvReport {
  const checks = report.checks.map((c) => (c.id === id ? { ...c, ...patch } : c));
  return { checks, ready: checks.every((c) => c.status === "pass") };
}
