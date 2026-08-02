import { useEffect, useState } from "react";
import { RotateCw, RefreshCw, Palette } from "lucide-react";
import type { Project } from "@vortspec/core/ipc";
import { ViewHeader } from "@vortspec/ui/ViewHeader";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { useAgentRun } from "../lib/useAgentRun";
import { buildCustomizeLibraryPrompt } from "@vortspec/core/sdd-prompts";
import { themeContractFor } from "@vortspec/core/setup";

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
  // Enterprise (Connect Enterprise Design System): re-reading the client's Storybook to refresh the
  // tokens + stand-ins ("Update snapshot") belongs HERE, on the design system, not in the Storybook view.
  const [isEnterprise, setIsEnterprise] = useState(false);
  // Theme-object libraries (MUI/Chakra/Mantine/Antd) can't take the CSS overlay — their personalization
  // has to be materialized into the library's real theme object by an agent (change:
  // consume-component-libraries, Phase 11). When the project is one, we surface a "Customize theme" action
  // that applies the durable overrides through the library's own lever. `null` = no such action needed
  // (css-vars / headless / enterprise / extract sources apply overrides automatically via the materializer).
  const [themeObjectLib, setThemeObjectLib] = useState<string | null>(null);
  const snapshot = useAgentRun();
  const customize = useAgentRun();

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

  async function updateSnapshot(): Promise<void> {
    const prompt = await api.enterpriseSnapshotPrompt(project.path).catch(() => "");
    if (!prompt) return;
    await snapshot.start({ prompt, cwd: project.path, allowedTools: ["Read", "Write", "Edit", "Bash"], bypassPermissions: true });
  }

  /**
   * Apply the durable token/component overrides to a theme-object library's REAL theme object. The agent
   * reads `.vortspec/theme-overrides.json` + the token↔theme-key map and patches the library's theme file
   * via its own lever (MUI `theme.components`, Chakra recipes, …) — the one apply step that isn't a
   * deterministic emit. No-ops cleanly when there are no pending overrides.
   */
  async function customizeTheme(): Promise<void> {
    if (!themeObjectLib) return;
    const contract = themeContractFor(themeObjectLib);
    if (!contract) return;
    await customize.start({
      prompt: buildCustomizeLibraryPrompt(themeObjectLib, contract),
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
  }

  useEffect(() => {
    void load();
    void api
      .projectConfig(project.path)
      .then((c) => {
        setIsEnterprise(c?.designSource === "enterprise");
        // A theme-object library edit needs an agent to write it into the real theme object.
        const needsAgent =
          c?.designSource === "library" && (c?.themeApply ?? "").startsWith("theme-object") && !!c?.componentLibrary;
        setThemeObjectLib(needsAgent ? c!.componentLibrary! : null);
      })
      .catch(() => {
        setIsEnterprise(false);
        setThemeObjectLib(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // The Flow bumps reloadSignal when a background foundation extraction finishes — re-read the palette
  // so the newly-extracted tokens + detected components show without the user hitting Refresh.
  useEffect(() => {
    if (reloadSignal !== undefined) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  // When the snapshot finishes: write the design manifest (designer.md) and reload the palette so the
  // refreshed tokens + stand-ins show immediately — no manual Refresh needed.
  useEffect(() => {
    if (snapshot.model.status !== "done") return;
    void api.writeDesignerManifest(project.path).catch(() => undefined);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.model.status]);

  // When a theme customization finishes, reload the palette so the newly-applied values show.
  useEffect(() => {
    if (customize.model.status !== "done") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customize.model.status]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-vs-bg-base">
      <ViewHeader className="text-[13px]">
        {!hideRail && (
          <Button variant="ghost" onClick={onBack}>
            ← Back
          </Button>
        )}
        <span className="font-medium text-vs-text-primary">Design System</span>
        <span className="text-vs-text-muted">— components &amp; tokens</span>
        {headerExtra}
        <div className="ml-auto flex items-center gap-2">
          {isEnterprise && (
            <button
              type="button"
              onClick={() => void updateSnapshot()}
              disabled={snapshot.running}
              title="Re-read your Storybook and refresh the design system — the tokens (all categories) and component stand-ins."
              className="flex cursor-pointer items-center gap-1.5 rounded border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary transition-colors hover:border-vs-accent hover:text-vs-text-primary disabled:cursor-default disabled:opacity-50"
            >
              <RefreshCw size={12} className={snapshot.running ? "animate-spin" : undefined} />
              {snapshot.running ? "Updating…" : "Update snapshot"}
            </button>
          )}
          {themeObjectLib && (
            <button
              type="button"
              onClick={() => void customizeTheme()}
              disabled={customize.running}
              title={`Apply your token & component edits to the ${themeObjectLib} theme — VortSpec patches the real theme object from your saved overrides (nothing changes if there are none).`}
              className="flex cursor-pointer items-center gap-1.5 rounded border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary transition-colors hover:border-vs-accent hover:text-vs-text-primary disabled:cursor-default disabled:opacity-50"
            >
              <Palette size={12} className={customize.running ? "animate-spin" : undefined} />
              {customize.running ? `Applying to ${themeObjectLib}…` : "Customize theme"}
            </button>
          )}
          {/* The plain Refresh (re-read from disk) is only useful when there's no Update snapshot — the
              enterprise Update snapshot already reloads the palette on completion, so it'd be a redundant
              second "refresh" button there. */}
          {!isEnterprise && (
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
          )}
        </div>
      </ViewHeader>

      {/* Progress bar for the active agent run — the enterprise Storybook snapshot OR a theme customization. */}
      {(snapshot.running || customize.running) && (
        <div className="flex flex-none flex-col gap-1.5 border-b border-vs-border-subtle bg-vs-bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2 text-[12px] text-vs-text-secondary">
            <Spinner />
            <span>
              {snapshot.running
                ? "Updating your design system & tokens from your Storybook…"
                : `Applying your token & component edits to the ${themeObjectLib} theme…`}
            </span>
            <span className="ml-auto truncate font-mono text-[10px] text-vs-text-muted">
              {(snapshot.running ? snapshot : customize).model.activity.at(-1)?.label ?? "working…"}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-vs-border-default">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-vs-accent" />
          </div>
        </div>
      )}

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
