import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Project, GitBranch } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Spinner } from "@vortspec/ui/ui";

/** A small git-branch glyph. */
function BranchIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="4.5" r="1.5" />
      <path d="M4 5v6M12 6a4 4 0 0 1-4 4H6.5" />
    </svg>
  );
}

/**
 * The status-bar branch control: shows the current branch and, on click, a menu
 * of the repo's other local branches (click to check one out) plus a "Create new
 * branch…" action that opens the Source Control view. The dropdown opens upward
 * (the bar sits at the bottom).
 */
export function StatusBranch({
  project,
  branch,
  onCheckout,
  onCreate,
}: {
  project: Project;
  branch: string;
  /** Called after a successful checkout (the host refreshes its branch state). */
  onCheckout?: (name: string) => void;
  /** "Create new branch…" → open the Git / Source Control section. */
  onCreate: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranch[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // An inline notice (checkout error, or the dirty-tree block with a git link).
  const [notice, setNotice] = useState<{ text: string; goToGit?: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setNotice(null);
    setBranches(null);
    void api
      .gitBranches(project.path)
      .then((bs) => alive && setBranches(bs))
      .catch(() => alive && setBranches([]));
    return () => {
      alive = false;
    };
  }, [open, project.path]);

  async function checkout(name: string): Promise<void> {
    setBusy(name);
    setNotice(null);
    // Guard: a dirty working tree can block or lose changes on checkout — send the
    // user to commit/stash in Source Control instead of switching silently.
    const status = await api.gitStatus(project.path).catch(() => null);
    if (status?.isRepo && status.clean === false) {
      setBusy(null);
      setNotice({ text: "You have uncommitted changes — commit or stash them before switching branches.", goToGit: true });
      return;
    }
    const res = await api.gitCheckout(project.path, name).catch(() => ({ ok: false, message: "Checkout failed." }));
    setBusy(null);
    if (res.ok) {
      onCheckout?.(name);
      setOpen(false);
    } else {
      setNotice({ text: res.message });
    }
  }

  const others = (branches ?? []).filter((b) => !b.remote && b.name !== branch);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Switch or create a branch"
        className="flex items-center gap-1 rounded px-1 text-vs-text-muted hover:text-vs-text-secondary"
      >
        <BranchIcon />
        <span className="font-mono">{branch}</span>
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute bottom-full left-0 z-50 mb-1 max-h-72 min-w-[200px] overflow-y-auto rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 text-xs shadow-xl">
            {branches === null ? (
              <div className="flex items-center gap-2 px-3 py-1.5 text-vs-text-muted">
                <Spinner /> Loading branches…
              </div>
            ) : (
              <>
                {others.length === 0 ? (
                  <div className="px-3 py-1.5 text-[11px] text-vs-text-muted">No other branches.</div>
                ) : (
                  others.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      role="menuitem"
                      disabled={busy !== null}
                      onClick={() => void checkout(b.name)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-vs-text-secondary hover:bg-vs-bg-hover disabled:opacity-60"
                    >
                      <BranchIcon />
                      <span className="min-w-0 flex-1 truncate font-mono">{b.name}</span>
                      {busy === b.name && <Spinner />}
                    </button>
                  ))
                )}
                <div className="my-1 border-t border-vs-border-subtle" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onCreate();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-vs-accent hover:bg-vs-bg-hover"
                >
                  ＋ Create new branch…
                </button>
                {notice && (
                  <div className="border-t border-vs-border-subtle px-3 py-1.5 text-[10px] text-vs-warning">
                    {notice.text}
                    {notice.goToGit && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onCreate();
                        }}
                        className="mt-1 block text-vs-accent hover:underline"
                      >
                        Open Source Control →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
