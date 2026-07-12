import type { JSX } from "react";
import { Button, Spinner } from "../ui";

/**
 * Run Doctor (change: run-doctor).
 *
 * Shown when the app fails to start or crashes at runtime. Offers deterministic
 * quick-fixes first (create `.env`, fill placeholder vars) and then a one-click,
 * gated "Fix with Claude" run — Claude Code diagnoses and applies a reviewable
 * fix, never inventing secrets.
 */
export type DoctorState = "idle" | "running" | "done";

export function RunDoctor({
  kind,
  error,
  file,
  env,
  envBusy,
  onCreateEnv,
  state,
  onFix,
  onFixInAssistant,
  handedOff,
  onKeep,
  onRevert,
  onOpenSource,
  onRestart,
  onDismiss,
}: {
  kind: "startup" | "runtime";
  error: string;
  file?: string | null;
  env: { hasEnv: boolean; examples: string[]; placeholders: string[] } | null;
  envBusy: boolean;
  onCreateEnv: () => void;
  state: DoctorState;
  onFix: () => void;
  /** When provided (an assistant host is mounted), the fix is handed to the
   *  sidebar chat instead of running inline — the user can leave this screen. */
  onFixInAssistant?: () => void;
  /** True once the fix has been handed to the assistant (shows the note). */
  handedOff?: boolean;
  onKeep: () => void;
  onRevert: () => void;
  onOpenSource?: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const missingEnv = env && !env.hasEnv && env.examples.length > 0;
  const placeholderEnv = env && env.hasEnv && env.placeholders.length > 0;

  return (
    <div className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-auto rounded-lg border border-vs-border-default bg-vs-bg-elevated p-4 text-left shadow-2xl">
      <div className="flex items-center gap-2">
        <span className="text-vs-warning">🩺</span>
        <span className="text-sm font-semibold text-vs-text-primary">
          Run Doctor — the app {kind === "startup" ? "failed to start" : "crashed at runtime"}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-auto text-vs-text-muted hover:text-vs-text-secondary"
        >
          ✕
        </button>
      </div>

      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-vs-border-default bg-vs-bg-surface p-2.5 font-mono text-[11px] text-vs-text-secondary">
        {file ? `${file}\n` : ""}
        {error}
      </pre>

      {/* Tier 1 — deterministic quick-fixes. */}
      {missingEnv && (
        <div className="flex items-center gap-3 rounded border border-vs-warning/40 bg-vs-warning/10 p-2.5 text-[12px]">
          <span className="min-w-0 flex-1 text-vs-text-primary">
            Missing <code className="font-mono">.env</code> — found{" "}
            <code className="font-mono">{env!.examples[0]}</code>.
          </span>
          <Button variant="default" disabled={envBusy} onClick={onCreateEnv}>
            {envBusy ? "Creating…" : "Create .env"}
          </Button>
        </div>
      )}
      {placeholderEnv && (
        <div className="rounded border border-vs-warning/40 bg-vs-warning/10 p-2.5 text-[12px] text-vs-text-primary">
          These variables still need real values (open <code className="font-mono">.env</code> and fill them in):{" "}
          <span className="font-mono text-vs-warning">{env!.placeholders.join(", ")}</span>. VortSpec won't fill
          in credentials for you — get them from the relevant dashboard.
        </div>
      )}

      {/* Tier 2 — Fix with Claude. With an assistant host, hand it to the sidebar
          chat so the user can leave this screen; otherwise run it inline. */}
      {onFixInAssistant ? (
        handedOff ? (
          <p className="text-[12px] text-vs-text-secondary">
            Handed to the assistant — it's working in the sidebar. Keep using the app; it'll point you back here when
            it's done.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[11px] text-vs-text-muted">
              Or let Claude read your project and apply a minimal, reviewable fix — in the assistant sidebar, so you can
              keep working. It won't invent secrets.
            </p>
            <Button variant="primary" onClick={onFixInAssistant}>
              Fix in the assistant →
            </Button>
          </div>
        )
      ) : (
        <>
          {state === "idle" && (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[11px] text-vs-text-muted">
                Or let Claude Code read your project and apply a minimal, reviewable fix. It won't invent secrets.
              </p>
              <Button variant="primary" onClick={onFix}>
                Fix with Claude
              </Button>
            </div>
          )}
          {state === "running" && (
            <div className="flex items-center gap-2 text-[12px] text-vs-text-secondary">
              <Spinner /> Claude is diagnosing and applying a fix…
            </div>
          )}
          {state === "done" && renderDone()}
        </>
      )}
    </div>
  );

  function renderDone(): JSX.Element {
    return (
        <div className="flex flex-col gap-2 rounded border border-vs-border-default bg-vs-bg-surface p-2.5">
          <p className="text-[12px] text-vs-text-primary">
            Claude applied changes. Review them in Source Control, then restart the app to check.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={onRestart}>
              Restart app
            </Button>
            {onOpenSource && (
              <Button variant="default" onClick={onOpenSource}>
                Review in Source Control
              </Button>
            )}
            <Button variant="ghost" onClick={onKeep}>
              Keep
            </Button>
            <Button variant="ghost" onClick={onRevert}>
              Revert
            </Button>
          </div>
        </div>
    );
  }
}
