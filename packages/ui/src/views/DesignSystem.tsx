import { useEffect, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { RunPanel } from "@vortspec/ui/RunPanel";
import { useAgentRun } from "../lib/useAgentRun";

/**
 * The lightweight "design system" view (OpenSpec change: light-design-system, task 2.4). Renders the
 * browsable palette — the component shelf + the visual reference (spacing, margins, padding, tokens)
 * captured from the design system — as a SELF-CONTAINED HTML document in a sandboxed iframe. This is a
 * VortSpec surface, distinct from real Storybook: it's usable before any framework component exists.
 *
 * The HTML is produced entirely in main (`getProjectPaletteHtml`) from the lite manifest; the iframe is
 * sandboxed with no `allow-scripts` because the palette is intentionally script-free.
 */
export function DesignSystem({
  project,
  hideRail = false,
  onBack,
}: {
  project: Project;
  hideRail?: boolean;
  onBack: () => void;
}): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wrote, setWrote] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const gen = useAgentRun();

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setHtml(await api.getLitePalette(project.path));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  async function writeDesigner(): Promise<void> {
    try {
      const path = await api.writeDesignerManifest(project.path);
      setWrote(`Wrote ${path}`);
      window.setTimeout(() => setWrote(""), 2600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Reuse the SAME Figma read that builds the framework components: run an agent that reads each
  // component's node once and emits the light HTML stand-in first (task 3.1, design D5). The palette
  // reads `.vortspec/light-html/…` on refresh, so real previews replace the placeholders.
  async function generatePreviews(): Promise<void> {
    try {
      const prompt = await api.liteStandInPrompt(project.path);
      await gen.start({ prompt, cwd: project.path, bypassPermissions: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // When the generation run finishes, refresh the palette so the new stand-ins show.
  useEffect(() => {
    if (gen.model.status === "done") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.model.status]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-vs-bg-base">
      <header className="flex flex-none items-center gap-2 border-b border-vs-border-subtle px-3 py-2 text-[13px]">
        {!hideRail && (
          <Button variant="ghost" onClick={onBack}>
            ← Back
          </Button>
        )}
        <span className="font-medium text-vs-text-primary">Design System</span>
        <span className="text-vs-text-muted">— lightweight palette</span>
        <div className="ml-auto flex items-center gap-2">
          {wrote && <span className="text-[12px] text-vs-text-muted">{wrote}</span>}
          <Button variant="ghost" onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={() => void generatePreviews()} disabled={gen.running}>
            {gen.running ? "Generating…" : "Generate previews from Figma"}
          </Button>
          <Button variant="primary" onClick={() => void writeDesigner()}>
            Write designer.md
          </Button>
        </div>
      </header>

      {(gen.running || gen.model.status === "done") && (
        <div className="flex-none border-b border-vs-border-subtle px-4 py-2.5">
          {/* Compact progress — like the token generation: a bar + status, details on demand. */}
          <div className="flex items-center gap-3 text-[12px]">
            {gen.running ? <Spinner /> : <span className="text-vs-success">✓</span>}
            <span className="text-vs-text-secondary">
              {gen.running ? "Generating light previews from Figma…" : "Previews generated from Figma"}
            </span>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-vs-border-default">
              <div
                className={`h-full rounded-full bg-vs-accent transition-[width] duration-500 ${gen.running ? "w-2/3 animate-pulse" : "w-full"}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="ml-auto text-[11px] text-vs-text-muted hover:text-vs-text-secondary"
            >
              {showDetails ? "Hide details" : "Details"}
            </button>
          </div>
          {showDetails && (
            <div className="mt-2 max-h-[280px] overflow-auto rounded border border-vs-border-subtle">
              <RunPanel model={gen.model} onSend={(t) => void gen.send(t)} canChat={gen.canChat} />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-vs-text-muted">
          <p>Couldn’t build the design system palette.</p>
          <pre className="max-w-[52ch] whitespace-pre-wrap text-[12px] text-vs-text-secondary">{error}</pre>
          <p className="text-[12px]">
            Make sure the project has been extracted (a <code>.sdd-de/components.json</code> and token file exist).
          </p>
        </div>
      ) : (
        <iframe
          title="Design System palette"
          className="min-h-0 flex-1 border-0 bg-vs-bg-base"
          sandbox="allow-same-origin"
          srcDoc={html ?? ""}
        />
      )}
    </div>
  );
}
