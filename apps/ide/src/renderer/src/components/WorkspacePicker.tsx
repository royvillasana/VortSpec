import { useEffect, useState } from "react";
import type { JSX, CSSProperties } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Spinner } from "@vortspec/ui/ui";
import { Logo } from "@vortspec/ui/Logo";

/**
 * The IDE's entry screen (VS Code–style welcome): the brand mark, then
 * link-style Start actions — open a folder, or clone a repository — and a list
 * of recent workspaces. Opening resolves the folder into a Project via the
 * shared workspace handlers (same as the cockpit); cloning reuses createFolder
 * + git import. No IDE-specific engine logic.
 */
export function WorkspacePicker({
  onOpen,
  onCreateProject,
}: {
  onOpen: (project: Project) => void;
  /** Start the "Create New Project" flow (folder pick → setup wizard). */
  onCreateProject: () => void;
}): JSX.Element {
  const [recent, setRecent] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Clone: an inline URL input (VS Code opens a quick-input for the repo URL).
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneErr, setCloneErr] = useState("");

  useEffect(() => {
    void api
      .listProjects()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  async function openFolder(): Promise<void> {
    setBusy(true);
    try {
      const project = await api.pickFolder(false);
      if (project) onOpen(project);
    } finally {
      setBusy(false);
    }
  }

  async function cloneRepo(): Promise<void> {
    const url = cloneUrl.trim();
    if (!url) return;
    setCloneBusy(true);
    setCloneErr("");
    try {
      // Choose/create an empty destination folder, then clone the remote into it.
      const dest = await api.createFolder();
      if (!dest) return; // user cancelled the folder picker
      const r = await api.gitImport({ projectPath: dest.path, url });
      if (!r.ok) {
        setCloneErr(r.message);
        return;
      }
      const fresh = await api.refreshProject(dest.path);
      onOpen(fresh ?? dest);
    } catch {
      setCloneErr("Couldn't clone that repository. Check the URL and your access.");
    } finally {
      setCloneBusy(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-vs-bg-primary">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center text-center">
          <Logo size={56} className="drop-shadow-[0_8px_24px_rgba(124,111,240,0.35)]" />
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.01em] text-vs-text-primary">
            VortSpec
          </h1>
          <p className="mt-1.5 text-sm text-vs-text-secondary">
            Create, open, or clone a project to design components, document them, and vibe-engineer against a live preview.
          </p>
        </div>

        <div className="mt-8">
          {/* Primary action — start a new project from scratch (SDD-DE setup).
              Filled with the brand logo gradient (blue → purple → magenta) and a
              spotlight glow that follows the cursor on hover. */}
          <button
            type="button"
            onClick={onCreateProject}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
            }}
            style={
              {
                "--x": "50%",
                "--y": "50%",
                backgroundImage: "linear-gradient(120deg, #1D4ED8 0%, #7C6FF0 50%, #9333EA 100%)",
              } as CSSProperties
            }
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-md px-3 py-2.5 text-sm font-semibold text-white"
          >
            {/* Cursor-following spotlight (revealed on hover). */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(140px circle at var(--x) var(--y), rgba(255,255,255,0.45), transparent 65%)",
              }}
            />
            <span className="relative flex items-center gap-2">
              <PlusIcon />
              Create New Project
            </span>
          </button>
          {/* Secondary actions — open a folder or clone a repo. */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void openFolder()}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-md border border-vs-border-default bg-vs-bg-surface px-3 py-2 text-[13px] text-vs-text-secondary hover:bg-vs-bg-hover disabled:opacity-50"
            >
              <FolderIcon />
              {busy ? "Opening…" : "Open Folder"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCloneErr("");
                setCloneOpen((v) => !v);
              }}
              disabled={cloneBusy}
              aria-pressed={cloneOpen}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[13px] hover:bg-vs-bg-hover disabled:opacity-50 ${
                cloneOpen ? "border-vs-accent bg-vs-bg-elevated text-vs-text-primary" : "border-vs-border-default bg-vs-bg-surface text-vs-text-secondary"
              }`}
            >
              <CloneIcon />
              Clone Repository
            </button>
          </div>

          {cloneOpen && (
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-vs-border-default bg-vs-bg-surface p-3">
              <input
                autoFocus
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void cloneRepo();
                }}
                placeholder="Repository URL (https://… or git@…)"
                className="w-full rounded border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 font-mono text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void cloneRepo()}
                  disabled={cloneBusy || !cloneUrl.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-vs-accent px-2.5 py-1 text-[12px] text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cloneBusy ? <Spinner /> : null}
                  {cloneBusy ? "Cloning…" : "Choose folder & clone"}
                </button>
                <button
                  type="button"
                  onClick={() => setCloneOpen(false)}
                  className="text-[12px] text-vs-text-muted hover:text-vs-text-secondary"
                >
                  Cancel
                </button>
              </div>
              {cloneErr && <p className="text-[11px] text-vs-error">{cloneErr}</p>}
            </div>
          )}
        </div>

        <div className="mt-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Workspaces
          </p>
          {recent === null ? (
            <div className="flex items-center gap-2 text-sm text-vs-text-muted">
              <Spinner /> Loading…
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-vs-text-muted">No recent projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recent.map((p) => (
                <li key={p.path}>
                  <button
                    type="button"
                    onClick={() => onOpen(p)}
                    className="flex w-full min-w-0 flex-col items-start rounded-md border border-vs-border-subtle bg-vs-bg-surface px-3 py-2 text-left transition-colors hover:bg-vs-bg-hover"
                  >
                    <span className="text-sm text-vs-text-primary">{p.name}</span>
                    <span className="w-full break-all font-mono text-[11px] text-vs-text-muted">{p.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4l2 2.5h5A1.5 1.5 0 0 1 17 7v8.5A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Z" />
    </svg>
  );
}

function CloneIcon(): JSX.Element {
  // A git-branch glyph: two nodes on a trunk, a fork curving to a third node.
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="1.6" />
      <circle cx="6" cy="15" r="1.6" />
      <circle cx="14" cy="7" r="1.6" />
      <path d="M6 6.6v6.8M6 11c0-2.4 1.2-3.6 3.4-4.2A6 6 0 0 0 12.4 7.4" />
    </svg>
  );
}
