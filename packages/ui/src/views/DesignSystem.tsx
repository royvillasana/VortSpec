import { useEffect, useState } from "react";
import { RotateCw, RefreshCw, AlertTriangle } from "lucide-react";
import type { AdoptionSummary, Project, ReadinessAssessmentPayload } from "@vortspec/core/ipc";
import { ViewHeader } from "@vortspec/ui/ViewHeader";
import { api } from "../lib/api";
import { Button, Spinner } from "@vortspec/ui/ui";
import { useAgentRun } from "../lib/useAgentRun";
import { ReadinessLadder } from "@vortspec/ui/ReadinessLadder";
import { AdoptionPanel } from "@vortspec/ui/AdoptionPanel";

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
  foundationOutcome = "idle",
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
  /**
   * What the last foundation run produced. `tokens-only` is the case this screen exists to make
   * visible: the run succeeded, extracted tokens, and found no components — which blocks every
   * downstream step while looking exactly like success.
   */
  foundationOutcome?: "idle" | "running" | "ready" | "tokens-only";
}): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Enterprise (Connect Enterprise Design System): re-reading the client's Storybook to refresh the
  // tokens + stand-ins ("Update snapshot") belongs HERE, on the design system, not in the Storybook view.
  const [isEnterprise, setIsEnterprise] = useState(false);
  // The AI-readiness ladder (agentic-design-system, task 5.3). Recomputed on every load rather than
  // cached, so it can never be the one thing on this screen disagreeing with everything beside it.
  const [readiness, setReadiness] = useState<ReadinessAssessmentPayload | null>(null);
  // Adoption READS the committed index rather than rebuilding it, so loading this screen costs a
  // file read — the Inspector's report run is what pays for the build.
  const [adoption, setAdoption] = useState<AdoptionSummary | null>(null);
  // Theme-object personalization ("Customize theme") lives in the design-system editor in the Variables
  // sidebar now (change: design-system-token-editor) — beside the levers whose edits it applies. This view
  // is the palette; it only owns the enterprise Storybook snapshot.
  const snapshot = useAgentRun();

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    void api.readinessLevel(project.path).then(setReadiness).catch(() => setReadiness(null));
    void api.adoptionSummary(project.path).then(setAdoption).catch(() => setAdoption(null));
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

  useEffect(() => {
    void load();
    void api
      .projectConfig(project.path)
      .then((c) => setIsEnterprise(c?.designSource === "enterprise"))
      .catch(() => setIsEnterprise(false));
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
          {/* "Customize theme" moved INTO the design-system editor in the Variables sidebar (change:
              design-system-token-editor, task 2.5) — beside the levers whose edits it applies, rather than
              a detached header button. The run state below still drives the shared progress bar. */}
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

      {foundationOutcome === "tokens-only" && (
        <section
          data-testid="foundation-tokens-only"
          className="border-b border-vs-border-subtle bg-vs-bg-secondary px-4 py-2"
        >
          <p className="flex items-center gap-1.5 text-[12px] text-vs-warning">
            <AlertTriangle size={13} className="flex-none" />
            Tokens were extracted, but no components were found in the design source.
          </p>
          <p className="pt-0.5 text-[11px] text-vs-text-secondary">
            The run finished successfully — there was simply nothing to read. A Figma file holding only a
            foundations sheet (palettes, type scale, spacing) produces exactly this. Component detection needs
            published components or component sets in the file.
          </p>
          <p className="pt-0.5 text-[11px] text-vs-text-muted">
            Nothing downstream can proceed without components: no relationship index, no metadata, no screens
            to compose from. Either add components to the design source and re-extract, or build them here from
            the tokens you already have.
          </p>
        </section>
      )}

      <ReadinessLadder readiness={readiness} />
      <AdoptionPanel
        adoption={adoption}
        onOpenReport={() =>
          void api.revealPath(project.path, ".vortspec/ai/reports/adoption.md").catch(() => undefined)
        }
      />

      {/* Progress bar for the enterprise Storybook snapshot. */}
      {snapshot.running && (
        <div className="flex flex-none flex-col gap-1.5 border-b border-vs-border-subtle bg-vs-bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2 text-[12px] text-vs-text-secondary">
            <Spinner />
            <span>Updating your design system &amp; tokens from your Storybook…</span>
            <span className="ml-auto truncate font-mono text-[10px] text-vs-text-muted">
              {snapshot.model.activity.at(-1)?.label ?? "working…"}
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
