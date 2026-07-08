import { useEffect, useRef, useState } from "react";
import type { DevServerStatus, Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Button, Spinner } from "@vortspec/ui/ui";
import { RunPanel } from "@vortspec/ui/RunPanel";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";

// Additive + idempotent: sets Storybook up if absent, then generates a story only
// for components that don't already have one — so it doubles as "sync stories" as
// the design system grows, without clobbering hand-tuned existing stories.
const STORYBOOK_PROMPT = [
  "Set up Storybook (if not already present) and generate stories for any components that don't have",
  "one yet, so VortSpec can embed real component docs, controls, and variants. This is safe to re-run.",
  "",
  "1. Read `.sdd-de/project.yaml` (framework, language, styling, component_dir) and",
  "   `.sdd-de/components.json` (the component inventory).",
  "2. If Storybook is NOT installed (no `.storybook/main.*`), install and initialize it for this",
  "   framework with the project's package manager (for React + Vite + TypeScript, use",
  "   `@storybook/react-vite` with the essentials addon). Add `.storybook/main.ts` whose `stories`",
  "   glob covers BOTH stories and MDX docs pages in the component dir (e.g. include",
  "   `'../src/components/**/*.stories.@(ts|tsx)'` AND `'../src/components/**/*.mdx'`), the framework,",
  "   and `docs: { autodocs: true }`) and",
  "   `.storybook/preview.ts` that imports the project's global styles / design-token CSS so",
  "   components render themed, with `parameters.layout = 'centered'`. If Storybook already exists,",
  "   leave its config and package.json untouched.",
  "3. Scan the component dir for source components and, for EACH component that does NOT already have a",
  "   sibling `<Component>.stories.tsx`, write one. Do NOT overwrite or modify any existing story file.",
  "   Each new story has:",
  "   - `title: '<ComponentName>'` (exactly the component name, no folder prefix), `tags: ['autodocs']`,",
  "     and `component: <Component>`.",
  "   - `argTypes` for the component's real props/variants (variant enum → select control, boolean →",
  "     boolean control) with short descriptions.",
  "   - A `Default` story with representative args PLUS a named story for each meaningful variant/state",
  "     (every `variant`, every `size`, disabled, etc.) so the autodocs page shows the full matrix.",
  "4. Ensure package.json has `\"storybook\": \"storybook dev -p 6006 --no-open\"` and",
  "   `\"build-storybook\": \"storybook build\"`. Install any missing deps.",
  "5. Do NOT modify the components themselves, and do NOT touch existing stories. End with a one-line",
  "   summary: how many components exist, how many stories already existed, and how many you added.",
  "",
  "When done, `storybook dev` should serve at http://localhost:6006 with an autodocs page per component.",
].join("\n");

// Generates rich, machine-facing per-component documentation pages in Storybook —
// matching a design-system component-doc reference. Additive + idempotent: builds
// shared doc-block components once, then a `<Component>.mdx` only for components
// that don't already have one. Data comes from the component specs + CVA/source +
// the Figma component-doc metadata tool (figma_generate_component_doc).
const DOCS_PROMPT = [
  "Generate rich, reference-grade Storybook documentation pages for this design system's components —",
  "the machine-facing 'component metadata' docs an AI agent reads to compose UIs. This is ADDITIVE and",
  "safe to re-run: never overwrite an existing docs page or story, never modify component source.",
  "Assumes each component already has a `<Component>.stories.tsx` (if not, generate the missing stories",
  "first, same rules as the story sync).",
  "",
  "Read `.sdd-de/project.yaml` (framework, language, component_dir, token_file, design_source,",
  "figma_file_url) and `.sdd-de/components.json`.",
  "",
  "STEP 1 — Shared doc blocks (create under `.storybook/doc-blocks/` only if missing; do NOT overwrite).",
  "Build small, reusable, presentational React components so every component's docs page looks identical",
  "and matches the reference. Style them clean and light (subtle table borders, monospace for code/values,",
  "chips/pills for enums, red-tinted cards for anti-patterns, color swatches for tokens, a highlighted box",
  "for AI hints). Use the project's own tokens where reasonable. Create:",
  "  - `Identity.tsx` — a key/value table: Category, Type, Import, Figma file, Figma node.",
  "  - `PropsTable.tsx` — columns Prop | Type/Values | Default | Description; render enum unions as pills.",
  "  - `Patterns.tsx` — 'Common Patterns': a list of { title, description, code } rendered as titled code examples.",
  "  - `AntiPatterns.tsx` — red cards, each { title, why, instead } with a ✗ marker.",
  "  - `StatesTable.tsx` — 'States & Behaviour': State | Description table.",
  "  - `A11y.tsx` — Accessibility: an ARIA role / Keyboard / Screen reader / WCAG table plus bullet notes.",
  "  - `Tokens.tsx` — 'Design Tokens': a swatch grid of { name, value } (color chip + name + value) with a",
  "    border-radius / shadow footnote.",
  "  - `AIHints.tsx` — 'AI Generation Hints': a use-case sentence, a Keywords chip list, and numbered Generation Rules.",
  "  Also add an `index.ts` barrel export.",
  "",
  "STEP 2 — Per-component data. For EACH component that does NOT already have a `<Component>.mdx` beside its",
  "story, gather its documentation data from:",
  "  - its Component Spec `specs/**/<component>-component-spec.md` (Purpose, Design Tokens Used, Variants,",
  "    States, Sizes, Props/API, Content Rules, Accessibility, Do-Not) and Interaction Spec if present,",
  "  - its `*.variants.ts` (CVA) and source file (real props, enum values, defaults),",
  "  - the token map: resolve the Tailwind classes the component uses to `token_file` values for the swatches,",
  "  - and, when `design_source: figma`, ENRICH with the Figma component-doc metadata tool. Resolve the",
  "    component's Figma nodeId in this order and DO NOT skip the tool just because the spec lacks a node id:",
  "      (a) a `figmaNodeId` field on the entry in `.sdd-de/components.json`, else",
  "      (b) the Figma frame/node URL in its Component Spec, else",
  "      (c) look it up by name via `figma_get_component_details` (componentName) or `figma_search_components`",
  "          against `figma_file_url`.",
  "    Then call `figma_generate_component_doc` with that nodeId and codeInfo (props, variantDefinition = the CVA",
  "    block, sourceFiles, importStatement, usageExamples). Use its output to source/verify the accurate data for",
  "    the EXISTING sections (per-variant color tokens for Design Tokens, anatomy/content-guidelines for the",
  "    identity + patterns, design annotations for States & Behaviour, a11y notes for Accessibility, and",
  "    design-code parity) — do NOT add new sections; keep the reference's 10-section layout. Record the resolved",
  "    nodeId in the Identity block. Only fall back to specs-only if the Figma bridge is genuinely unreachable,",
  "    and note that in the run summary.",
  "  Compose the curated sections not present in the sources: Common Patterns (real usage recipes with code),",
  "  Anti-Patterns (Why + Instead), and AI Generation Hints (a use-case sentence + Keywords + numbered Generation Rules).",
  "",
  "STEP 3 — Write `<Component>.mdx` beside each component's story. Start with `import { Meta, Primary, Controls,",
  "Stories } from '@storybook/blocks';`, import the shared doc blocks, import the component's stories, and set",
  "`<Meta of={<Component>Stories} />` so this MDX becomes that component's docs page (replacing thin autodocs).",
  "Render the sections in EXACTLY this order to match the reference:",
  "  1) a live preview via <Primary /> (with Storybook's show/copy-code),",
  "  2) Component Identity  (<Identity … />),",
  "  3) Props               (<PropsTable … /> — or <Controls /> plus the typed table),",
  "  4) Common Patterns     (<Patterns … />),",
  "  5) Anti-Patterns       (<AntiPatterns … />),",
  "  6) States & Behaviour  (<StatesTable … />),",
  "  7) Accessibility       (<A11y … />),",
  "  8) Design Tokens       (<Tokens … />),",
  "  9) AI Generation Hints (<AIHints … />),",
  "  10) Stories            (<Stories />).",
  "",
  "STEP 4 — Make the docs pages render. Ensure `.storybook/main.ts`'s `stories` glob matches `*.mdx` in the",
  "component dir (add e.g. `'../src/components/**/*.mdx'` if it isn't already) — otherwise Storybook compiles",
  "but never displays these pages. Then run `build-storybook` as a sanity check (remove the artifact).",
  "",
  "Idempotent: skip any component that already has a `<Component>.mdx`; do not modify components, existing",
  "stories, or existing docs. If `design_source` is not figma, skip the figma tool and compose from the specs +",
  "source only. End with a one-line summary: how many docs pages you created, how many already existed, and how",
  "many components are now fully documented. Re-run to complete any remaining.",
].join("\n");

/**
 * Component Playground — generates and embeds a real Storybook for the project.
 * Storybook's own sidebar drives which component/story you see; VortSpec just
 * stands the server up and embeds it. Component changes go through the global
 * assistant dock (top-bar Chat), which is modify-capable on this screen.
 * Claude Code is the engine — VortSpec doesn't re-implement Storybook.
 */
export function DevPreview({
  project,
  onBack,
  onOpenRun,
  onOpenInspector,
  onOpenHistory,
  onOpenManifest,
}: {
  project: Project;
  onBack: () => void;
  onOpenRun: () => void;
  onOpenInspector: () => void;
  onOpenHistory: () => void;
  onOpenManifest: () => void;
}): React.JSX.Element {
  const [devUrl, setDevUrl] = useState("");
  const [dev, setDev] = useState<DevServerStatus>({
    state: "stopped",
    url: null,
    script: null,
    message: null,
  });
  const [frameLoading, setFrameLoading] = useState(true);

  const storybook = useAgentRun();
  const autoRef = useRef(false);
  // Which Storybook sync is in flight — labels the run overlay.
  const [syncMode, setSyncMode] = useState<"stories" | "docs">("stories");

  const base = (devUrl.trim() || dev.url || "").replace(/\/+$/, "");
  const embedUrl = base ? `${base}/` : "";

  // Follow the managed dev server for this project.
  useEffect(() => {
    void api.devServerStatus(project.path).then(setDev);
    return api.onDevServerUpdate(({ projectPath, kind, status }) => {
      if (projectPath === project.path && kind === "storybook") setDev(status);
    });
  }, [project.path]);

  async function startPreview(): Promise<void> {
    setDev(await api.startDevServer(project.path));
  }
  function stopPreview(): void {
    void api.stopDevServer(project.path);
  }
  async function generateStorybook(): Promise<void> {
    setSyncMode("stories");
    await storybook.start({
      prompt: STORYBOOK_PROMPT,
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
  }
  async function generateDocs(): Promise<void> {
    setSyncMode("docs");
    await storybook.start({
      prompt: DOCS_PROMPT,
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
  }

  // Once Storybook is written, launch it automatically.
  useEffect(() => {
    if (storybook.model.status === "done") void startPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storybook.model.status]);

  // Auto bring-up on entering: embed a running Storybook instantly; if Storybook
  // is set up, launch it; otherwise generate it (then it launches) — no clicks.
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    void (async () => {
      const status = await api.devServerStatus(project.path);
      if (status.url) {
        setDev(status);
        return;
      }
      const info = await api.previewInfo(project.path);
      if (info.hasStorybook) {
        await startPreview();
        return;
      }
      if (!storybook.running) void generateStorybook();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  useEffect(() => setFrameLoading(true), [embedUrl]);

  const building = storybook.running || (storybook.model.status === "done" && !dev.url);

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems("playground", {
          onFlow: onBack,
          onRun: onOpenRun,
          onPlayground: () => undefined,
          onTokens: onOpenInspector,
          onManifest: onOpenManifest,
          onHistory: onOpenHistory,
        })}
      />

      {/* Canvas */}
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-5 py-3">
          <span className="text-[15px] font-semibold">Playground</span>
          <span className="rounded border border-vs-border-default px-1.5 py-px text-[10px] uppercase tracking-wide text-vs-text-muted">
            Storybook
          </span>
          <span className="text-xs text-vs-text-muted">Browse components in the Storybook sidebar →</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            disabled={storybook.running}
            onClick={() => void generateStorybook()}
            title="Set up Storybook if needed, and add stories for any newly-built components (existing stories are left untouched)"
          >
            {storybook.running && syncMode === "stories" ? "Syncing stories…" : "Sync stories"}
          </Button>
          <Button
            variant="ghost"
            disabled={storybook.running}
            onClick={() => void generateDocs()}
            title="Generate rich per-component documentation pages (identity, props, patterns, anti-patterns, states, accessibility, tokens, AI hints) from the specs + Figma metadata. Additive — existing docs are left untouched."
          >
            {storybook.running && syncMode === "docs" ? "Syncing docs…" : "Sync docs"}
          </Button>
          <DevServerControl
            status={dev}
            onStart={() => void startPreview()}
            onStop={stopPreview}
            onOpen={(u) => void api.openInstall(u)}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-vs-bg-primary">
          {building ? (
            <RunOverlay
              title={
                storybook.running
                  ? syncMode === "docs"
                    ? "Generating rich component documentation pages (identity, props, patterns, tokens, AI hints)…"
                    : "Syncing Storybook — adding stories for any components that don't have one yet…"
                  : "Storybook ready — starting it up…"
              }
              run={storybook}
              done={!storybook.running}
            />
          ) : embedUrl ? (
            <div className="relative h-full min-h-[340px]">
              <iframe
                key={embedUrl}
                title="storybook"
                src={embedUrl}
                onLoad={() => setFrameLoading(false)}
                className="h-full min-h-[340px] w-full border-0 bg-white"
              />
              {frameLoading && <LoadingVeil label="Loading Storybook…" />}
            </div>
          ) : dev.state === "error" ? (
            <div className="flex min-h-[340px] items-center justify-center p-12">
              <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-vs-border-default bg-vs-bg-surface p-6 text-center">
                <p className="text-sm font-semibold text-vs-error">Storybook failed to start</p>
                <p className="text-xs text-vs-text-muted">{dev.message}</p>
                <div className="flex gap-2">
                  <Button variant="default" onClick={() => void startPreview()}>
                    Try again
                  </Button>
                  <Button variant="primary" onClick={() => void generateStorybook()}>
                    Sync stories
                  </Button>
                </div>
                <UrlOverride value={devUrl} onChange={setDevUrl} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[340px] items-center justify-center p-12">
              <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-vs-border-default bg-vs-bg-surface p-6 text-center">
                <Spinner />
                <p className="text-sm font-medium text-vs-text-secondary">
                  {dev.state === "starting"
                    ? "Starting Storybook — the first boot can take a moment…"
                    : "Preparing the Storybook playground…"}
                </p>
                <p className="text-xs text-vs-text-muted">
                  VortSpec is standing up Storybook for you — no setup needed.
                </p>
                <UrlOverride value={devUrl} onChange={setDevUrl} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** A translucent veil over the Storybook iframe while it loads. */
function LoadingVeil({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
        <Spinner /> {label}
      </div>
    </div>
  );
}

function RunOverlay({
  title,
  run,
  done,
}: {
  title: string;
  run: ReturnType<typeof useAgentRun>;
  done?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[340px] items-start justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-vs-border-default bg-vs-bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-vs-text-primary">
          {done ? <span className="text-vs-success">✓</span> : <Spinner />} {title}
        </div>
        <RunPanel model={run.model} onSend={(t) => void run.send(t)} canChat={run.canChat} />
      </div>
    </div>
  );
}

function DevServerControl({
  status,
  onStart,
  onStop,
  onOpen,
}: {
  status: DevServerStatus;
  onStart: () => void;
  onStop: () => void;
  onOpen: (url: string) => void;
}): React.JSX.Element {
  if (status.state === "running" && status.url) {
    const port = status.url.match(/:(\d+)/)?.[1] ?? "";
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpen(status.url!)}
          title={status.url}
          className="flex items-center gap-1.5 rounded-lg border border-vs-border-default px-2.5 py-1.5 text-[11px] text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-vs-success" />
          <span className="font-mono">:{port}</span>
          <span className="text-vs-text-muted">↗</span>
        </button>
        <button
          onClick={onStop}
          className="rounded-lg border border-vs-border-strong px-2.5 py-1.5 text-[11px] text-vs-text-secondary hover:border-vs-error hover:text-vs-error"
        >
          Stop
        </button>
      </div>
    );
  }
  if (status.state === "starting") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-vs-text-secondary">
        <Spinner /> Starting{status.script ? ` ${status.script}` : ""}…
      </span>
    );
  }
  const disabled = status.state === "no-script";
  return (
    <Button
      variant="default"
      disabled={disabled}
      onClick={onStart}
      title={disabled ? "No storybook/dev script in package.json" : undefined}
    >
      Start Storybook
    </Button>
  );
}

function UrlOverride({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="http://localhost:6006"
      className="mt-1 w-56 rounded-md border border-vs-border-strong bg-vs-bg-primary px-2.5 py-1.5 text-center font-mono text-[11px] text-vs-text-secondary placeholder:text-vs-text-muted focus:outline-none focus-visible:border-vs-accent"
    />
  );
}
