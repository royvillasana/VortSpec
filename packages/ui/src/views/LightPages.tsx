import { useEffect, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { RunPanel } from "@vortspec/ui/RunPanel";
import { useAgentRun } from "../lib/useAgentRun";

/**
 * Light page authoring (light-design-system, task 5.1). Create a page FROM the live design system —
 * the agent composes framework-free HTML from `designer.md`'s light components, with NO built React
 * required — and preview it live. The real framework code is generated later by the transform step.
 */
export function LightPages({ project }: { project: Project }): React.JSX.Element {
  const [pages, setPages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useAgentRun();

  async function loadPages(): Promise<void> {
    try {
      const list = await api.litePages(project.path);
      setPages(list);
      setSelected((cur) => cur ?? list[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  async function loadPage(n: string): Promise<void> {
    try {
      setHtml(await api.liteReadPage(project.path, n));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    if (selected) void loadPage(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, project.path]);

  async function create(): Promise<void> {
    const n = name.trim();
    if (!n || gen.running) return;
    setError(null);
    try {
      const prompt = await api.litepagePrompt(project.path, n, description);
      await gen.start({ prompt, cwd: project.path, bypassPermissions: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // When a compose run finishes, refresh the list + jump to the new page.
  useEffect(() => {
    if (gen.model.status !== "done") return;
    void loadPages();
    if (name.trim()) setSelected(name.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.model.status]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-vs-bg-base">
      <header className="flex flex-none items-center gap-2 border-b border-vs-border-subtle px-3 py-2 text-[13px]">
        <span className="font-medium text-vs-text-primary">Pages</span>
        <span className="text-vs-text-muted">— composed from the light design system</span>
      </header>

      {/* Create bar */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-vs-border-subtle px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Page name (e.g. Airbnb Landing)"
          className="w-52 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary focus:outline-none"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the page — sections, content, layout"
          className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
        <Button variant="primary" onClick={() => void create()} disabled={!name.trim() || gen.running}>
          {gen.running ? "Composing…" : "Create page"}
        </Button>
      </div>

      {(gen.running || gen.model.status === "done") && (
        <div className="flex-none border-b border-vs-border-subtle px-3 py-2 text-[12px]">
          <div className="flex items-center gap-3">
            {gen.running ? <Spinner /> : <span className="text-vs-success">✓</span>}
            <span className="text-vs-text-secondary">{gen.running ? "Composing the page from the design system…" : "Page composed"}</span>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-vs-border-default">
              <div className={`h-full rounded-full bg-vs-accent transition-[width] ${gen.running ? "w-2/3 animate-pulse" : "w-full"}`} />
            </div>
            <button type="button" onClick={() => setShowDetails((v) => !v)} className="ml-auto text-[11px] text-vs-text-muted hover:text-vs-text-secondary">
              {showDetails ? "Hide details" : "Details"}
            </button>
          </div>
          {showDetails && (
            <div className="mt-2 max-h-[240px] overflow-auto rounded border border-vs-border-subtle">
              <RunPanel model={gen.model} onSend={(t) => void gen.send(t)} canChat={gen.canChat} />
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Pages list */}
        <div className="flex w-52 flex-none flex-col overflow-y-auto border-r border-vs-border-subtle">
          {pages.length === 0 ? (
            <p className="p-3 text-[12px] text-vs-text-muted">No pages yet. Name one above and Create it from the design system.</p>
          ) : (
            pages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelected(p)}
                className={`px-3 py-2 text-left text-[12px] ${selected === p ? "bg-vs-bg-hover text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover"}`}
              >
                {p}
              </button>
            ))
          )}
        </div>

        {/* Preview */}
        <div className="min-h-0 flex-1">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-vs-text-muted">
              <p>Couldn’t load the page.</p>
              <pre className="max-w-[52ch] whitespace-pre-wrap text-[12px] text-vs-text-secondary">{error}</pre>
            </div>
          ) : selected && html ? (
            <iframe title={`Light page: ${selected}`} className="h-full w-full border-0 bg-white" sandbox="allow-same-origin" srcDoc={html} />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-vs-text-muted">
              {selected ? "Empty page." : "Select or create a page to preview it."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
