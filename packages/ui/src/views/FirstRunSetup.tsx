import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Terminal } from "../components/Terminal";
import { Button, Card, Spinner } from "../components/ui";

/**
 * Guided first-run setup (change: pivot-to-desktop-cockpit, D5).
 *
 * A one-click, sequenced, resumable/idempotent surface that gets a freshly
 * installed app to a ready state through the UI: (1) open an embedded terminal,
 * (2) sign in to Claude Code by driving the login into that terminal (browser
 * OAuth) and detecting completion by polling — no app restart, no stored
 * credentials, and (3) connect Figma. On mount it re-detects which steps are
 * already done and skips them; each step reflects live status.
 */
type StepStatus = "pending" | "active" | "done" | "error";

export interface FirstRunSetupProps {
  /** A workspace to scope the terminal to; when absent, the user's home dir is used
   *  (first-run happens before any project exists). */
  project?: Project;
  /** All required steps complete → proceed into the app. */
  onDone: () => void;
  /** Skip setup for now (steps can be resumed later). */
  onSkip?: () => void;
}

export function FirstRunSetup({ project, onDone, onSkip }: FirstRunSetupProps): JSX.Element {
  // The terminal needs a cwd; before any project exists, fall back to home.
  const [termProject, setTermProject] = useState<Project | null>(project ?? null);
  useEffect(() => {
    if (project) {
      setTermProject(project);
      return;
    }
    let alive = true;
    void api
      .homeDir()
      .then((home) => {
        if (alive)
          setTermProject({
            id: "home",
            name: "Home",
            path: home,
            toolkit: { present: false, version: null, updateAvailable: false },
            lastRunStatus: "none",
            addedAt: "",
          });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [project]);

  const [termId, setTermId] = useState<string | null>(null);
  const [claude, setClaude] = useState<StepStatus>("pending");
  const [figma, setFigma] = useState<StepStatus>("pending");
  const [busy, setBusy] = useState<null | "claude" | "figma">(null);
  const [detecting, setDetecting] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Idempotent + resumable: on mount, detect steps that are already complete.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [login, fig] = await Promise.all([
        api.verifyLogin().catch(() => null),
        api.figmaStatus().catch(() => null),
      ]);
      if (!alive) return;
      if (login?.status === "pass") setClaude("done");
      if (fig?.connected) setFigma("done");
      setDetecting(false);
    })();
    return () => {
      alive = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const terminalReady = termId !== null;
  const allDone = terminalReady && claude === "done" && figma === "done";

  // Step 2 — drive `claude` into the embedded terminal (which walks the user
  // through browser login on an unauthed machine), then poll until logged in.
  const signInClaude = useCallback(() => {
    if (!termId) return;
    setClaude("active");
    setBusy("claude");
    void api.terminalWrite(termId, "claude\r");
    const start = Date.now();
    const poll = async (): Promise<void> => {
      const r = await api.verifyLogin().catch(() => null);
      if (r?.status === "pass") {
        setClaude("done");
        setBusy(null);
        return;
      }
      if (Date.now() - start > 5 * 60_000) {
        setClaude("error");
        setBusy(null);
        return;
      }
      pollRef.current = setTimeout(() => void poll(), 3000);
    };
    pollRef.current = setTimeout(() => void poll(), 4000);
  }, [termId]);

  // Step 3 — connect Figma (figma-cli, the primary path), then re-check.
  const connectFigma = useCallback(async () => {
    setFigma("active");
    setBusy("figma");
    await api.figmaConnect("yolo").catch(() => null);
    const r = await api.figmaStatus().catch(() => null);
    setFigma(r?.connected ? "done" : "error");
    setBusy(null);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-vs-bg-primary p-6 text-vs-text-primary">
      <div className="flex items-center gap-3">
        <h1 className="text-[16px] font-semibold">Set up VortSpec</h1>
        <span className="text-[12px] text-vs-text-muted">A one-time guided setup — resumes where you left off.</span>
        {onSkip && (
          <button className="ml-auto text-[12px] text-vs-text-muted hover:text-vs-text-secondary" onClick={onSkip}>
            Skip for now
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex w-[320px] flex-none flex-col gap-2.5">
          <Step n={1} title="Open a terminal" status={terminalReady ? "done" : "active"} detail="An embedded shell scoped to your project.">
            {!terminalReady && <Spinner />}
          </Step>

          <Step
            n={2}
            title="Sign in to Claude Code"
            status={detecting ? "active" : claude}
            detail="Opens Claude Code in the terminal; complete the browser sign-in. VortSpec stores no credentials."
          >
            {claude !== "done" && !detecting && (
              <Button variant="primary" disabled={!terminalReady || busy !== null} onClick={signInClaude}>
                {busy === "claude" ? "Waiting for sign-in…" : "Sign in"}
              </Button>
            )}
            {claude === "error" && <span className="text-[11px] text-vs-warning">Didn't detect a login — try again.</span>}
          </Step>

          <Step
            n={3}
            title="Connect Figma"
            status={detecting ? "active" : figma}
            detail="Connect figma-cli so VortSpec can read your design system (optional, for Figma sources)."
          >
            {figma !== "done" && !detecting && (
              <Button variant="default" disabled={busy !== null} onClick={() => void connectFigma()}>
                {busy === "figma" ? "Connecting…" : "Connect Figma"}
              </Button>
            )}
            {figma === "error" && <span className="text-[11px] text-vs-warning">Couldn't connect — see the Figma panel.</span>}
          </Step>

          {allDone && (
            <Button variant="primary" onClick={onDone}>
              Continue to VortSpec
            </Button>
          )}
        </div>

        <Card className="flex min-w-0 flex-1 overflow-hidden p-0">
          {termProject ? <Terminal project={termProject} onReady={setTermId} /> : <Spinner />}
        </Card>
      </div>
    </div>
  );
}

const DOT: Record<StepStatus, string> = {
  pending: "border-vs-border-default text-vs-text-muted",
  active: "border-vs-accent text-vs-accent",
  done: "border-vs-success bg-vs-success text-white",
  error: "border-vs-warning text-vs-warning",
};

function Step({
  n,
  title,
  status,
  detail,
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  detail: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Card className="flex gap-3 p-3">
      <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] font-semibold ${DOT[status]}`}>
        {status === "done" ? "✓" : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-[11px] leading-relaxed text-vs-text-muted">{detail}</span>
        <div className="flex items-center gap-2 pt-0.5">{children}</div>
      </div>
    </Card>
  );
}
