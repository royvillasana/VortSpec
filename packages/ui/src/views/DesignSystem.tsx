import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
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
 *
 * Building the design system (component stand-ins, framework components, designer.md) is AUTOMATIC now —
 * the Flow kicks the foundation extraction in the background and the app-level auto-build builds + verifies
 * the components five at a time. So this view carries NO build/generate/write buttons; it's a pure reference
 * that just needs a Refresh (icon, top-right) after a background pass lands.
 */
export function DesignSystem({
  project,
  hideRail = false,
  onBack,
  headerExtra,
  reloadSignal,
  extracting = false,
}: {
  project: Project;
  hideRail?: boolean;
  onBack: () => void;
  /** Extra header content (e.g. a background-setup note + an "under the hood" toggle from the Flow). */
  headerExtra?: React.ReactNode;
  /** Bump to re-read the palette from disk — e.g. after a background foundation extraction lands. */
  reloadSignal?: number;
  /** The foundation is extracting in the background — show a friendly "setting up" state, not an error. */
  extracting?: boolean;
}): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // The Flow bumps reloadSignal when a background foundation extraction finishes — re-read the palette
  // so the newly-extracted tokens + detected components show without the user hitting Refresh.
  useEffect(() => {
    if (reloadSignal !== undefined) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-vs-bg-base">
      <header className="flex flex-none items-center gap-2 border-b border-vs-border-subtle px-3 py-2 text-[13px]">
        {!hideRail && (
          <Button variant="ghost" onClick={onBack}>
            ← Back
          </Button>
        )}
        <span className="font-medium text-vs-text-primary">Design System</span>
        <span className="text-vs-text-muted">— components &amp; tokens</span>
        {headerExtra}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh — re-read the palette from disk (the design system builds automatically in the background)"
            aria-label="Refresh"
            className="rounded p-1.5 text-vs-text-muted transition-colors hover:bg-vs-bg-hover hover:text-vs-text-primary disabled:opacity-50"
          >
            <RotateCw size={14} className={loading ? "animate-spin" : undefined} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        extracting ? (
          // The foundation is being extracted in the background — the palette isn't on disk yet.
          // Show a friendly setup state (this is the landing right after intake) rather than the error.
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-vs-text-muted">
            <Spinner />
            <p className="text-vs-text-secondary">Setting up your design system…</p>
            <p className="max-w-[46ch] text-[12px]">
              Extracting your tokens and detecting components in the background. This can take a minute —
              the palette fills in automatically when it’s ready.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-vs-text-muted">
            <p>Couldn’t build the design system palette.</p>
            <pre className="max-w-[52ch] whitespace-pre-wrap text-[12px] text-vs-text-secondary">{error}</pre>
            <p className="text-[12px]">
              Make sure the project has been extracted (a <code>.sdd-de/components.json</code> and token file exist).
            </p>
          </div>
        )
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
