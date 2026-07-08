import { useEffect, useState } from "react";
import type { Project, SetupAnswers } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Button } from "../components/ui";

type Tab = "zip" | "figma" | "github" | "folder";
type Mcp = "checking" | "ok" | "unauth" | "unknown";

/**
 * Add a design source (design: "Design Input.dc.html", adapted to v2) — pick a
 * ZIP export, a Figma link (with a live Figma-MCP status), or an existing folder.
 * The selection pre-seeds the setup wizard; nothing is copied, Claude Code reads
 * the source as the SDD-DE CLI does.
 */
export function DesignInput({
  project,
  onBack,
  onContinue,
}: {
  project: Project;
  onBack: () => void;
  onContinue: (source: Partial<SetupAnswers>) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("zip");
  const [zipPath, setZipPath] = useState("");
  const [figmaUrl, setFigmaUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [githubBranch, setGithubBranch] = useState("");
  const [mcp, setMcp] = useState<Mcp>("checking");
  const [mcpDetail, setMcpDetail] = useState("");
  const [dsOpen, setDsOpen] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    void api.verifyFigmaMcp().then((c) => {
      setMcp(c.status === "pass" ? "ok" : c.status === "fail" ? "unauth" : "unknown");
      setMcpDetail(c.detail);
    });
  }, []);

  async function pickFolder(): Promise<void> {
    const picked = await api.pickFolder(false);
    if (picked) setFolderPath(picked.path);
  }

  const figmaValid = /figma\.com\//.test(figmaUrl);
  const githubValid = /^(https?:\/\/|git@|ssh:\/\/).+/.test(githubUrl.trim());
  const canStart =
    (tab === "zip" && zipPath.trim().endsWith(".zip")) ||
    (tab === "figma" && figmaValid) ||
    (tab === "github" && githubValid) ||
    (tab === "folder" && folderPath.trim().length > 0);

  function submit(): void {
    if (!canStart) return;
    if (tab === "zip") onContinue({ designSource: "zip", zipFilePath: zipPath.trim() });
    else if (tab === "figma") onContinue({ designSource: "figma", figmaFileUrl: figmaUrl.trim() });
    else if (tab === "github")
      onContinue({
        designSource: "github",
        githubRepoUrl: githubUrl.trim(),
        githubBranch: githubBranch.trim() || undefined,
      });
    else onContinue({ designSource: "github", githubRepoUrl: folderPath.trim() });
  }

  return (
    <div
      className="min-h-[calc(100vh-3rem)] bg-vs-bg-primary text-vs-text-primary"
      onDragEnter={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
    >
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-6 pb-16 pt-10">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-vs-text-muted">
              <button onClick={onBack} className="hover:text-vs-text-primary">
                Projects
              </button>
              <span>/</span>
              <span className="truncate">{project.name}</span>
              <span>/</span>
              <span>New source</span>
            </div>
            <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Add a design source</h1>
            <p className="text-[13px] leading-relaxed text-vs-text-secondary">
              Claude Code reads the design exactly as the SDD-DE CLI does. Pick a source — it&rsquo;s
              placed at the project&rsquo;s expected input path.
            </p>
          </div>
          <Button variant="ghost" className="flex-none" onClick={onBack}>
            Cancel
          </Button>
        </div>

        <div className="flex gap-0.5 self-start rounded-lg border border-vs-border-default bg-vs-bg-surface p-0.5">
          {(
            [
              ["zip", "ZIP export"],
              ["figma", "Figma link"],
              ["github", "GitHub repo"],
              ["folder", "Folder / repo"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === id ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:text-vs-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "zip" && (
          <Panel title="Upload a ZIP export" desc="Google Stitch, Claude Design, or any HTML/CSS export — it lands at .sdd-de/input/.">
            {zipPath.trim().endsWith(".zip") ? (
              <div className="flex h-[132px] items-center justify-center rounded-lg border border-dashed border-vs-border-strong">
                <span className="inline-flex items-center gap-2 rounded-md border border-vs-border-strong bg-vs-bg-elevated px-2.5 py-1.5">
                  <span className="font-mono text-[11px] text-vs-text-primary">
                    {zipPath.split("/").pop()}
                  </span>
                  <button
                    onClick={() => setZipPath("")}
                    className="rounded px-1 leading-none text-vs-text-muted hover:bg-vs-border-default hover:text-vs-error"
                  >
                    ×
                  </button>
                </span>
              </div>
            ) : (
              <label className="flex h-[132px] cursor-text flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-vs-border-strong px-4 text-center text-xs text-vs-text-secondary hover:border-vs-accent">
                <UploadIcon />
                Drop your .zip here, or paste its path below.
                <input
                  value={zipPath}
                  onChange={(e) => setZipPath(e.target.value)}
                  placeholder="/path/to/export.zip"
                  className="mt-1 w-64 rounded-md border border-vs-border-default bg-vs-bg-primary px-2.5 py-1.5 text-center font-mono text-[11px] text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:border-vs-accent"
                />
              </label>
            )}
          </Panel>
        )}

        {tab === "figma" && (
          <Panel title="Paste a Figma link" desc="Claude Code reads it through your configured Figma MCP. VortSpec never touches the Figma API itself.">
            <input
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/design/…"
              className="h-[38px] rounded-md border border-vs-border-default bg-vs-bg-primary px-3 font-mono text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
            />
            {mcp === "ok" ? (
              <div className="flex items-center gap-2 text-xs text-vs-success">
                <span>✓</span> Figma MCP connected
              </div>
            ) : mcp === "checking" ? (
              <div className="text-xs text-vs-text-muted">Checking Figma MCP…</div>
            ) : (
              <div className="flex gap-3 rounded-lg border border-vs-error/40 bg-vs-error/[0.06] p-3.5">
                <span className="text-sm leading-tight text-vs-error">⚠</span>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="text-[13px] font-medium text-vs-text-primary">
                    Figma MCP isn&rsquo;t connected
                  </div>
                  <div className="text-xs leading-relaxed text-vs-text-secondary">
                    {mcpDetail || "Reconnect it in Claude Code before importing from Figma."}
                  </div>
                  <div className="mt-0.5 flex gap-2">
                    <Button
                      variant="default"
                      onClick={() => void api.openInstall("https://claude.ai/customize/connectors")}
                    >
                      Connect Figma
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void api.openInstall("https://code.claude.com/docs/en/mcp")}
                    >
                      MCP docs ↗
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        )}

        {tab === "github" && (
          <Panel title="Import a GitHub repository" desc="VortSpec clones the repo into your project, then scans it for design tokens and components and builds them locally. Uses your own git.">
            <div className="flex flex-col gap-2.5">
              <input
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="h-[38px] w-full rounded-md border border-vs-border-default bg-vs-bg-primary px-3 font-mono text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              />
              <input
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="branch (optional — defaults to the repo's default branch)"
                className="h-[38px] w-full rounded-md border border-vs-border-default bg-vs-bg-primary px-3 font-mono text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              />
              <p className="text-xs text-vs-text-muted">
                The repo is imported into this project folder on Continue; the design system is built from it,
                and you can publish changes back on a new branch + PR from Source Control.
              </p>
            </div>
          </Panel>
        )}

        {tab === "folder" && (
          <Panel title="Use an existing folder or repo" desc="Point at HTML/CSS on disk, or a repo you're iterating on. Nothing is copied — Claude Code reads it in place.">
            <div className="flex items-center gap-3">
              <div className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-md border border-vs-border-default bg-vs-bg-primary px-3">
                <FolderIcon />
                <span className="truncate font-mono text-xs text-vs-text-primary">
                  {folderPath || "No folder selected"}
                </span>
              </div>
              <Button variant="default" onClick={() => void pickFolder()}>
                {folderPath ? "Change" : "Choose folder…"}
              </Button>
            </div>
          </Panel>
        )}

        <div className="overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-surface">
          <button
            onClick={() => setDsOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-[13px] font-medium text-vs-text-primary hover:bg-vs-bg-hover"
          >
            <span
              className="text-[10px] text-vs-text-muted transition-transform"
              style={{ transform: dsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            Attach a design system <span className="font-normal text-vs-text-muted">(optional)</span>
          </button>
          {dsOpen && (
            <div className="flex flex-col gap-2.5 px-4 pb-4">
              <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-vs-border-strong text-xs text-vs-text-secondary">
                tokens.json, CSS variables, or a second ZIP (configure in setup)
              </div>
              <p className="text-xs leading-relaxed text-vs-text-muted">
                Claude Code matches extracted values against your official tokens and flags conflicts
                during verification.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-vs-border-default pt-5">
          <Button variant="ghost" onClick={onBack}>
            ← Cancel
          </Button>
          <Button variant="primary" disabled={!canStart} onClick={submit}>
            Continue to setup →
          </Button>
        </div>
      </div>

      {drag && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0] as (File & { path?: string }) | undefined;
            const path = f?.path;
            if (path?.endsWith(".zip")) {
              setTab("zip");
              setZipPath(path);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-vs-bg-primary/90 p-6"
        >
          <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-vs-accent" />
          <div className="pointer-events-none flex flex-col items-center gap-2">
            <span className="text-[20px] font-semibold tracking-[-0.01em]">
              Drop to import into {project.name}
            </span>
            <span className="font-mono text-xs text-vs-text-secondary">
              .zip → .sdd-de/input/
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-vs-border-default bg-vs-bg-surface p-6">
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-vs-text-secondary">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function UploadIcon(): React.JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 16 V5 M8 9 L12 5 L16 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15 V18 A1 1 0 0 0 6 19 H18 A1 1 0 0 0 19 18 V15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="flex-none" aria-hidden>
      <path
        d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5.5 L7 4 H11.5 A1 1 0 0 1 12.5 5 V10.5 A1 1 0 0 1 11.5 11.5 H2.5 A1 1 0 0 1 1.5 10.5 Z"
        fill="none"
        stroke="#7C6FF0"
        strokeWidth="1.3"
      />
    </svg>
  );
}
