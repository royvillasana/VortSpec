import { useEffect, useState } from "react";
import type { GitStatus, GitBranch, GitRemote, ProviderAuth, Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";
import { ProjectRail, projectRailItems } from "../components/ProjectRail";

/**
 * Source Control (git) — M1. Drives the user's own `git`/`gh` through the
 * GitAdapter. Additive only: create-and-work-in-branch + stage/commit/pull/push/
 * fetch. There is deliberately NO delete-branch or force-push affordance.
 */
export function SourceControl({
  project,
  onBack,
  onFlow,
  onRun,
  onPlayground,
  onTokens,
  onManifest,
  onHistory,
}: {
  project: Project;
  onBack: () => void;
  onFlow: () => void;
  onRun: () => void;
  onPlayground: () => void;
  onTokens: () => void;
  onManifest: () => void;
  onHistory: () => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [auth, setAuth] = useState<ProviderAuth | null>(null);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [manifestReady, setManifestReady] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importBranch, setImportBranch] = useState("");

  async function reload(): Promise<void> {
    const [s, b, r] = await Promise.all([
      api.gitStatus(project.path),
      api.gitBranches(project.path),
      api.gitRemotes(project.path),
    ]);
    setStatus(s);
    setBranches(b);
    setRemotes(r);
  }
  useEffect(() => {
    void reload();
    void api.providerAuth(project.path).then(setAuth);
    void api.getManifest(project.path).then((m) => setManifestReady(m.exists));
  }, [project.path]);

  function flash(m: string): void {
    setToast(m);
    window.setTimeout(() => setToast(""), 2600);
  }
  async function act(label: string, fn: () => Promise<{ ok: boolean; message: string }>): Promise<void> {
    setBusy(label);
    const r = await fn();
    await reload();
    setBusy(null);
    flash(r.message);
  }

  const localBranches = branches.filter((b) => !b.remote);
  const notRepo = status && !status.isRepo;

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("source", {
          onFlow,
          onRun,
          onPlayground,
          onTokens,
          onManifest,
          onHistory,
          onSource: () => undefined,
        })}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-8 py-4">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Source Control</h1>
          {status?.isRepo && (
            <>
              <span className="rounded border border-vs-border-default px-1.5 py-px font-mono text-[11px] text-vs-text-secondary">
                {status.branch ?? "detached"}
              </span>
              {(status.ahead > 0 || status.behind > 0) && (
                <span className="text-[11px] text-vs-text-muted">↑{status.ahead} ↓{status.behind}</span>
              )}
            </>
          )}
          <div className="flex-1" />
          <button onClick={() => void reload()} className="text-xs text-vs-text-secondary hover:text-vs-text-primary">
            ↻ Refresh
          </button>
        </header>

        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-8 py-6">
          {status === null ? (
            <div className="flex items-center gap-2 text-sm text-vs-text-secondary"><Spinner /> Reading git…</div>
          ) : notRepo ? (
            <Card className="flex flex-col items-start gap-4 p-5">
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-vs-text-secondary">This folder isn't a git repository yet.</p>
                <Button variant="default" disabled={busy !== null} onClick={() => void act("init", () => api.gitInit(project.path))}>
                  Initialize repository
                </Button>
              </div>
              <div className="flex w-full flex-col gap-2 border-t border-vs-border-default pt-4">
                <p className="text-sm font-medium text-vs-text-primary">Import a GitHub repo as the design source</p>
                <p className="text-[11px] text-vs-text-muted">
                  Bring a repository into this project, then run the Design system stage to scan its tokens and
                  components and build them locally.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="w-72 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-xs placeholder:text-vs-text-muted"
                  />
                  <input
                    value={importBranch}
                    onChange={(e) => setImportBranch(e.target.value)}
                    placeholder="branch (optional)"
                    className="w-40 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-xs placeholder:text-vs-text-muted"
                  />
                  <Button
                    variant="primary"
                    disabled={busy !== null || !importUrl.trim()}
                    onClick={() =>
                      void act("import", () =>
                        api.gitImport({ projectPath: project.path, url: importUrl.trim(), branch: importBranch.trim() || undefined }),
                      )
                    }
                  >
                    Import from GitHub
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* GitHub connect */}
              <GitHubConnect
                auth={auth}
                remotes={remotes}
                projectPath={project.path}
                branch={status.branch}
                manifestReady={manifestReady}
                busy={busy !== null}
                onChanged={async () => {
                  await reload();
                  setAuth(await api.providerAuth(project.path));
                }}
                flash={flash}
                setBusy={setBusy}
              />

              {/* Branches (create + switch — never delete) */}
              <section className="flex flex-col gap-2">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Branch</h2>
                <Card className="flex flex-wrap items-center gap-2 p-4">
                  <select
                    value={status.branch ?? ""}
                    onChange={(e) => void act("checkout", () => api.gitCheckout(project.path, e.target.value))}
                    className="rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-xs"
                  >
                    {localBranches.map((b) => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                    {status.branch && !localBranches.some((b) => b.name === status.branch) && (
                      <option value={status.branch}>{status.branch}</option>
                    )}
                  </select>
                  <span className="flex-1" />
                  <input
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    placeholder="new-branch-name"
                    className="w-48 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-xs placeholder:text-vs-text-muted"
                  />
                  <Button
                    variant="default"
                    disabled={busy !== null || !newBranch.trim()}
                    onClick={() =>
                      void act("createBranch", () => api.gitCreateBranch(project.path, newBranch.trim())).then(() => setNewBranch(""))
                    }
                  >
                    Create &amp; switch
                  </Button>
                </Card>
                <p className="text-[11px] text-vs-text-muted">
                  VortSpec only creates and switches branches — it never deletes a branch or rewrites history.
                </p>
              </section>

              {/* Changes */}
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Changes</h2>
                  <span className="flex-1" />
                  <button
                    disabled={busy !== null || status.clean}
                    onClick={() => void act("stageAll", () => api.gitStage(project.path, ["."]))}
                    className="text-xs text-vs-accent hover:underline disabled:opacity-40"
                  >
                    Stage all
                  </button>
                </div>
                <Card className="flex flex-col p-0">
                  {status.clean ? (
                    <p className="p-4 text-sm text-vs-text-muted">Working tree clean.</p>
                  ) : (
                    <>
                      <ChangeGroup title="Staged" rows={status.staged.map((c) => ({ path: c.path, tag: c.status }))}
                        action="Unstage" disabled={busy !== null}
                        onAction={(p) => void act("unstage", () => api.gitUnstage(project.path, [p]))} />
                      <ChangeGroup title="Changes"
                        rows={[...status.unstaged.map((c) => ({ path: c.path, tag: c.status })), ...status.untracked.map((p) => ({ path: p, tag: "untracked" as const }))]}
                        action="Stage" disabled={busy !== null}
                        onAction={(p) => void act("stage", () => api.gitStage(project.path, [p]))} />
                      {status.conflicts.length > 0 && (
                        <div className="border-t border-vs-border-default px-4 py-2 text-xs text-vs-error">
                          Conflicts: {status.conflicts.join(", ")} — resolve them in your editor.
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </section>

              {/* Commit + remote actions */}
              <section className="flex flex-col gap-2">
                <textarea
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Commit message…"
                  className="w-full resize-y rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    disabled={busy !== null || status.staged.length === 0 || !message.trim()}
                    onClick={() => void act("commit", () => api.gitCommit(project.path, message.trim())).then(() => setMessage(""))}
                  >
                    Commit ({status.staged.length})
                  </Button>
                  <span className="flex-1" />
                  <Button variant="default" disabled={busy !== null} onClick={() => void act("fetch", () => api.gitFetch(project.path))}>Fetch</Button>
                  <Button variant="default" disabled={busy !== null} onClick={() => void act("pull", () => api.gitPull(project.path))}>Pull</Button>
                  <Button variant="default" disabled={busy !== null} onClick={() => void act("push", () => api.gitPush(project.path))}>Push</Button>
                </div>
                {busy && <span className="flex items-center gap-2 text-xs text-vs-text-secondary"><Spinner /> {busy}…</span>}
              </section>
            </>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border border-vs-border-strong bg-vs-bg-elevated px-4 py-2 text-xs text-vs-text-primary shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function GitHubConnect({
  auth,
  remotes,
  projectPath,
  branch,
  manifestReady,
  busy,
  onChanged,
  flash,
  setBusy,
}: {
  auth: ProviderAuth | null;
  remotes: GitRemote[];
  projectPath: string;
  branch: string | null;
  manifestReady: boolean;
  busy: boolean;
  onChanged: () => Promise<void>;
  flash: (m: string) => void;
  setBusy: (v: string | null) => void;
}): React.JSX.Element {
  const [repoName, setRepoName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public" | "internal">("private");
  const [creating, setCreating] = useState(false);
  const [createProvider, setCreateProvider] = useState<"github" | "gitlab">("github");
  const origin = remotes.find((r) => r.name === "origin")?.url ?? null;
  const providerLabel = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" }[auth?.provider ?? "github"];

  async function run(label: string, fn: () => Promise<{ ok: boolean; message: string; url?: string | null }>): Promise<void> {
    setBusy(label);
    const r = await fn();
    await onChanged();
    setBusy(null);
    flash(r.url ? `${r.message} ${r.url}` : r.message);
  }

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">{providerLabel}</span>
        <span className="flex-1" />
        {auth === null ? (
          <span className="flex items-center gap-1.5 text-xs text-vs-text-muted"><Spinner /> checking…</span>
        ) : auth.authenticated ? (
          <span className="flex items-center gap-1.5 text-xs text-vs-success">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-success" />
            Connected{auth.accounts.length <= 1 && ` as ${auth.activeAccount}`}
          </span>
        ) : (
          <button onClick={() => void onChanged()} className="text-xs text-vs-accent hover:underline">
            Connect / re-check
          </button>
        )}
      </div>

      {origin && <p className="font-mono text-[11px] text-vs-text-secondary">{origin}</p>}

      {auth && !auth.authenticated && auth.hint && (
        <p className="rounded-md border border-vs-warning-border bg-vs-warning-muted px-3 py-2 text-[11px] text-vs-warning">
          {auth.hint}
        </p>
      )}

      {/* Multi-account picker */}
      {auth && auth.authenticated && auth.accounts.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-vs-text-secondary">
          Account
          <select
            value={auth.activeAccount ?? ""}
            disabled={busy}
            onChange={(e) => void run("switch account", () => api.providerSwitchAccount(projectPath, e.target.value))}
            className="rounded-md border border-vs-border-default bg-vs-bg-primary px-2 py-1 text-xs"
          >
            {auth.accounts.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <span className="text-vs-text-muted">{auth.accounts.length} accounts — pick which to use</span>
        </label>
      )}

      {/* Create repo (authed + no origin) */}
      {auth && auth.authenticated && !origin && (
        creating ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={createProvider}
              onChange={(e) => setCreateProvider(e.target.value as "github" | "gitlab")}
              className="rounded-md border border-vs-border-default bg-vs-bg-primary px-2 py-1.5 text-xs"
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
            <input
              autoFocus
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="new-repo-name"
              className="w-44 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-xs placeholder:text-vs-text-muted"
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "private" | "public" | "internal")}
              className="rounded-md border border-vs-border-default bg-vs-bg-primary px-2 py-1.5 text-xs"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
            </select>
            <Button
              variant="primary"
              disabled={busy || !repoName.trim()}
              onClick={() =>
                void run("create repo", () =>
                  api.providerCreateRepo({ projectPath, providerId: createProvider, name: repoName.trim(), visibility }),
                ).then(() => setCreating(false))
              }
            >
              Create &amp; push
            </Button>
            <button onClick={() => setCreating(false)} className="text-xs text-vs-text-muted hover:text-vs-text-primary">Cancel</button>
          </div>
        ) : (
          <div>
            <Button variant="default" disabled={busy} onClick={() => setCreating(true)}>
              Create a repo (GitHub / GitLab) &amp; push this folder
            </Button>
          </div>
        )
      )}

      {/* Open PR (authed + origin + a branch) */}
      {auth && auth.authenticated && origin && branch && (
        <div>
          <Button
            variant="default"
            disabled={busy}
            onClick={() =>
              void run("open PR", () =>
                api.providerCreatePR({ projectPath, title: `${branch}` }),
              )
            }
          >
            Open pull request for {branch}
          </Button>
        </div>
      )}

      {/* Gated push-back (M3): publish the built design system on a new branch + PR */}
      {auth && auth.authenticated && origin && (
        <div className="flex flex-col gap-1.5 border-t border-vs-border-default pt-2.5">
          <Button
            variant="primary"
            disabled={busy || !manifestReady}
            onClick={() =>
              void run("publish design system", () =>
                api.providerPublish({
                  projectPath,
                  branch: "vortspec/design-system",
                  title: "VortSpec: design system (tokens, components, DESIGN.md)",
                }),
              )
            }
          >
            Publish design system → new branch + PR
          </Button>
          <p className="text-[11px] text-vs-text-muted">
            {manifestReady
              ? "Creates the vortspec/design-system branch, commits the generated tokens/components/DESIGN.md, pushes, and opens a PR. Never pushes to main."
              : "Available once DESIGN.md is generated (the design-system gate). Generate the manifest first."}
          </p>
        </div>
      )}
    </Card>
  );
}

function ChangeGroup({
  title,
  rows,
  action,
  disabled,
  onAction,
}: {
  title: string;
  rows: { path: string; tag: string }[];
  action: string;
  disabled: boolean;
  onAction: (path: string) => void;
}): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <div className="border-b border-vs-border-default last:border-b-0">
      <div className="bg-vs-bg-primary px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-vs-text-muted">
        {title} <span className="text-vs-border-strong">{rows.length}</span>
      </div>
      {rows.map((r) => (
        <div key={r.path} className="flex items-center gap-2 px-4 py-1.5 text-xs">
          <span className="w-16 shrink-0 text-vs-text-muted">{r.tag}</span>
          <span className="flex-1 truncate font-mono text-vs-text-primary">{r.path}</span>
          <button disabled={disabled} onClick={() => onAction(r.path)} className="text-vs-accent hover:underline disabled:opacity-40">
            {action}
          </button>
        </div>
      ))}
    </div>
  );
}
