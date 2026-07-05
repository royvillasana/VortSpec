import { useEffect, useState } from "react";

/**
 * D0 skeleton landing. This is a placeholder cockpit shell that proves the
 * electron-vite + React + Tailwind renderer boots with the extracted VortSpec
 * design tokens. The real onboarding / environment-check screen lands in D0.2.
 */
export default function App(): React.JSX.Element {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    window.vortspec
      ?.getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-vs-bg-primary text-vs-text-primary">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-vs-accent-muted text-2xl font-semibold text-vs-accent">
          V
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">VortSpec</h1>
        <p className="text-sm text-vs-text-secondary">
          The Spec-Driven Design Engineering desktop cockpit
        </p>
      </div>

      <div className="rounded-lg border border-vs-border-default bg-vs-bg-surface px-5 py-4 text-center">
        <p className="text-xs uppercase tracking-wide text-vs-text-muted">
          D0 skeleton
        </p>
        <p className="mt-1 text-sm text-vs-text-secondary">
          electron-vite renderer online · v{version}
        </p>
      </div>

      <p className="max-w-sm text-center text-xs text-vs-text-muted">
        Next: onboarding &amp; environment check (Node, git, Claude Code, login).
      </p>
    </div>
  );
}
