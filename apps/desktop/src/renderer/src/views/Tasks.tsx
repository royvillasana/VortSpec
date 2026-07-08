import { useEffect, useState } from "react";
import type { IssueLinks, Project, TaskAuth, TaskProject } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";
import { ProjectRail, projectRailItems } from "../components/ProjectRail";

/**
 * Tasks (Jira, M7) — drives the user's own Jira CLI (no VortSpec account). Offers
 * to install the CLI with permission, connects, and creates stories (incl. "the
 * spec is the story"). Every write is an explicit user action.
 */
export function Tasks({
  project,
  onBack,
  onFlow,
  onRun,
  onPlayground,
  onTokens,
  onManifest,
  onHistory,
  onSource,
}: {
  project: Project;
  onBack: () => void;
  onFlow: () => void;
  onRun: () => void;
  onPlayground: () => void;
  onTokens: () => void;
  onManifest: () => void;
  onHistory: () => void;
  onSource: () => void;
}): React.JSX.Element {
  const [auth, setAuth] = useState<TaskAuth | null>(null);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [links, setLinks] = useState<IssueLinks>({});
  const [proj, setProj] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"Story" | "Task" | "Bug">("Story");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [confirmInstall, setConfirmInstall] = useState(false);

  async function loadAuth(): Promise<void> {
    const a = await api.taskAuth();
    setAuth(a);
    if (a.configured) {
      const [ps, ls] = await Promise.all([api.taskProjects(), api.taskLinks(project.path)]);
      setProjects(ps);
      setLinks(ls);
      if (ps[0] && !proj) setProj(ps[0].key);
    }
  }
  useEffect(() => {
    void loadAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  function flash(m: string): void {
    setToast(m);
    window.setTimeout(() => setToast(""), 3200);
  }
  async function run(label: string, fn: () => Promise<{ ok: boolean; message: string; url?: string | null }>): Promise<void> {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    flash(r.url ? `${r.message} ${r.url}` : r.message);
    await loadAuth();
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("tasks", {
          onFlow,
          onRun,
          onPlayground,
          onTokens,
          onManifest,
          onHistory,
          onSource,
          onTasks: () => undefined,
        })}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-8 py-4">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Tasks</h1>
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">Jira</span>
          <div className="flex-1" />
          <button onClick={() => void loadAuth()} className="text-xs text-vs-text-secondary hover:text-vs-text-primary">↻ Refresh</button>
        </header>

        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-8 py-6">
          {/* Connect */}
          <Card className="flex flex-col gap-2.5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Jira</span>
              <span className="flex-1" />
              {auth === null ? (
                <span className="flex items-center gap-1.5 text-xs text-vs-text-muted"><Spinner /> checking…</span>
              ) : auth.configured ? (
                <span className="flex items-center gap-1.5 text-xs text-vs-success">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-success" /> Connected as {auth.account}
                </span>
              ) : (
                <button onClick={() => void loadAuth()} className="text-xs text-vs-accent hover:underline">Connect / re-check</button>
              )}
            </div>

            {auth && !auth.configured && auth.hint && (
              <p className="rounded-md border border-vs-warning-border bg-vs-warning-muted px-3 py-2 text-[11px] text-vs-warning">{auth.hint}</p>
            )}

            {/* Install the CLI with explicit permission */}
            {auth && !auth.cliInstalled && auth.installCommand && (
              confirmInstall ? (
                <div className="flex flex-col gap-2 rounded-md border border-vs-border-default bg-vs-bg-primary p-3">
                  <p className="text-[11px] text-vs-text-secondary">VortSpec will run, with your permission:</p>
                  <code className="rounded bg-vs-bg-code px-2 py-1 font-mono text-[11px] text-vs-text-primary">{auth.installCommand}</code>
                  <div className="flex gap-2">
                    <Button variant="primary" disabled={busy !== null} onClick={() => void run("install", () => api.taskInstall()).then(() => setConfirmInstall(false))}>
                      {busy ? "Installing…" : "Install the Jira CLI"}
                    </Button>
                    <button onClick={() => setConfirmInstall(false)} className="text-xs text-vs-text-muted hover:text-vs-text-primary">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <Button variant="default" disabled={busy !== null} onClick={() => setConfirmInstall(true)}>Install the Jira CLI (with permission)</Button>
                </div>
              )
            )}
          </Card>

          {/* Create a story */}
          {auth?.configured && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Create a story</h2>
              <Card className="flex flex-col gap-2.5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={proj} onChange={(e) => setProj(e.target.value)} className="rounded-md border border-vs-border-default bg-vs-bg-primary px-2 py-1.5 text-xs">
                    {projects.length === 0 && <option value="">No projects</option>}
                    {projects.map((p) => (<option key={p.key} value={p.key}>{p.key} — {p.name}</option>))}
                  </select>
                  <select value={type} onChange={(e) => setType(e.target.value as "Story" | "Task" | "Bug")} className="rounded-md border border-vs-border-default bg-vs-bg-primary px-2 py-1.5 text-xs">
                    <option value="Story">Story</option>
                    <option value="Task">Task</option>
                    <option value="Bug">Bug</option>
                  </select>
                  <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" className="min-w-[260px] flex-1 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-xs placeholder:text-vs-text-muted" />
                </div>
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description / acceptance criteria (optional)" className="w-full resize-y rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-xs placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle" />
                <div>
                  <Button
                    variant="primary"
                    disabled={busy !== null || !proj || !summary.trim()}
                    onClick={() =>
                      void run("create story", () => api.taskCreateIssue({ project: proj, type, summary: summary.trim(), description: description.trim() || undefined })).then(() => { setSummary(""); setDescription(""); })
                    }
                  >
                    Create {type}
                  </Button>
                </div>
                <p className="text-[11px] text-vs-text-muted">
                  Tip: from the Flow, a component's spec can become a story — "the spec is the story".
                </p>
              </Card>
            </section>
          )}

          {/* Linked stories */}
          {auth?.configured && Object.keys(links).length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Linked stories</h2>
              <Card className="flex flex-col p-0">
                {Object.entries(links).map(([ref, key]) => (
                  <div key={ref} className="flex items-center gap-2 border-b border-vs-border-default px-4 py-2 text-xs last:border-b-0">
                    <span className="flex-1 truncate text-vs-text-primary">{ref}</span>
                    <span className="font-mono text-vs-text-secondary">{key}</span>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 max-w-[80vw] truncate rounded-lg border border-vs-border-strong bg-vs-bg-elevated px-4 py-2 text-xs text-vs-text-primary shadow-2xl">{toast}</div>
      )}
    </div>
  );
}
