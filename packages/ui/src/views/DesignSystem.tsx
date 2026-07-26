import { useEffect, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";

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
          <Button variant="primary" onClick={() => void writeDesigner()}>
            Write designer.md
          </Button>
        </div>
      </header>

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
