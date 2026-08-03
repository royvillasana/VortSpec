import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Palette } from "lucide-react";
import type { Project } from "@vortspec/core/ipc";
import { previewWithDrafts } from "@vortspec/core/design-library";
import type { DesignPreview, DesignSystemLibrary, LibraryRow, LibrarySection, TokenDrift } from "@vortspec/core/design-library";
import { applyLightDark, isValidStyleValue, parseLightDark, swatchHex } from "@vortspec/core/style-values";
import { isFontFamilyValue, leadFamily } from "@vortspec/core/fonts";
import { FontPicker } from "@vortspec/ui/FontPicker";
import { PresetsMode } from "@vortspec/ui/PresetsMode";
import { Spinner } from "@vortspec/ui/ui";
import { useAgentRun } from "../lib/useAgentRun";
import { buildCustomizeLibraryPrompt } from "@vortspec/core/sdd-prompts";
import { themeContractFor } from "@vortspec/core/setup";
import { api } from "../lib/api";

/**
 * The **Library** tab: the project's design system, sectioned by style property (change:
 * design-system-style-panel).
 *
 * Every row is one of the PROJECT'S OWN tokens under its own name. That is the difference from the lever
 * panel this replaces, which enumerated seven knobs VortSpec knew about and so could not reach a project's
 * `--radius-card` or `--radius-pill` at all. Here a token is editable because the project has it.
 *
 * Deterministic throughout: values come from the overlay-aware reader and every edit writes the same
 * durable overlay as before, so a consumed library's real files are never touched.
 *
 * Takes nothing surface-specific, because the same component mounts in two docks — the Playground sidebar
 * and the Design-tokens sidebar — and must behave identically in both.
 */
export function LibraryPanel({
  project,
  onEdited,
  tokensInUse,
  selectedComponent,
}: {
  project: Project;
  /** Called after a committed edit, so whatever is previewed beside this panel reloads. */
  onEdited: () => void;
  /**
   * Token → resolved value for every token the selected element uses.
   *
   * The ones this design system HAS are marked in place — the design system is the same design system
   * whatever is selected, so nothing is filtered, reordered or hidden. The ones it does NOT have are
   * listed separately, because a component built on a token the design system never defined would
   * otherwise show nothing, and silence is the one answer that is never true.
   *
   * A plain object, not a Map: this prop crosses the component-test boundary, where props are
   * serialized and a Map arrives empty.
   */
  tokensInUse?: Readonly<Record<string, string>>;
  /** The selected component's name, when one is selected — what "this component only" would mean. */
  selectedComponent?: string | null;
}): React.JSX.Element {
  const [model, setModel] = useState<DesignSystemLibrary | null>(null);
  // Where the SCREENS differ, keyed by token so each row can offer its own adopt.
  const [drift, setDrift] = useState<Map<string, TokenDrift>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"manual" | "presets">("manual");
  // What the preview should show INSTEAD of the saved design system: a preset the user is considering, or
  // the values they are typing right now. Both answer "what would this look like?" before anything is
  // written, which is the only question the preview exists to answer.
  const [presetPreview, setPresetPreview] = useState<Record<string, unknown> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Per-component overrides from the durable overlay. Read separately from the token model because they
  // are a different kind of thing: not a value in the design system, but a rule laid over it.
  const [componentOverrides, setComponentOverrides] = useState<[string, Record<string, string>][]>([]);
  const customize = useAgentRun();
  // A Set so a large design system does not do a linear scan per tile.
  const inUseSet = useMemo(() => new Set(Object.keys(tokensInUse ?? {})), [tokensInUse]);
  /**
   * The selected component's own styles, grouped by the design system's sections.
   *
   * Same rows, same tiles — collected under the component instead of scattered across five sections of a
   * list hundreds of rows long. Marking answers "is this one used?"; this answers "what is this made of?".
   */
  const componentSections = useMemo(() => {
    if (!model || !selectedComponent) return [];
    return model.sections
      .map((sec) => ({ ...sec, rows: sec.rows.filter((r) => inUseSet.has(r.token)) }))
      .filter((sec) => sec.rows.length > 0);
  }, [model, selectedComponent, inUseSet]);

  /** The selection's tokens this design system does not define — the drift, named. */
  const unmapped = useMemo(() => {
    if (!model) return [];
    const known = new Set(model.sections.flatMap((sec) => sec.rows.map((r) => r.token)));
    return Object.entries(tokensInUse ?? {}).filter(([name]) => !known.has(name));
  }, [tokensInUse, model]);

  const load = useCallback(async () => {
    try {
      const [lib, d] = await Promise.all([
        api.designSystemLibrary(project.path),
        api.designSystemTokenDrift(project.path).catch(() => null),
      ]);
      setModel(lib);
      setDrift(new Map((d?.drifts ?? []).map((x) => [x.token, x])));
      setError(null);
      // The override list is ADDITIONAL to the design system, so it is read separately and defensively:
      // a failure here must leave the tokens on screen rather than blanking the panel behind an error.
      try {
        const overrides = await api.getThemeOverrides(project.path);
        setComponentOverrides(
          Object.entries(overrides?.components ?? {})
            .map(([name, o]) => [name, o.base ?? {}] as [string, Record<string, string>])
            .filter(([, decls]) => Object.keys(decls).length > 0),
        );
      } catch {
        setComponentOverrides([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [project.path]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * This panel is mounted on TWO surfaces at once (the Playground's Library tab and the Design-tokens
   * sidebar), so an edit made on one would otherwise leave the other showing a value that is no longer
   * true — and still editable, so the next click there would write back a superseded value. Watching the
   * overlay file keeps both honest. The workspace watcher is reference-counted, so two subscribers are safe.
   */
  useEffect(() => {
    void api.watchWorkspace(project.path);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = api.onWorkspaceChange((e) => {
      if (e.projectPath !== project.path) return;
      if (e.path !== null && !/^\.vortspec\/(theme-overrides|presets)\.json$/.test(e.path)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 250);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
      void api.unwatchWorkspace(project.path);
    };
  }, [project.path, load]);

  /**
   * A `theme-object:<lib>` project can't take the CSS overlay, so an agent patches the library's real
   * theme object from the saved overrides — the one apply step that isn't a deterministic emit.
   */
  async function customizeTheme(): Promise<void> {
    const lib = model?.componentLibrary;
    const contract = lib ? themeContractFor(lib) : undefined;
    if (!lib || !contract) return;
    await customize.start({
      prompt: buildCustomizeLibraryPrompt(lib, contract),
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
    });
  }

  useEffect(() => {
    if (customize.model.status !== "done") return;
    void load();
    onEdited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customize.model.status]);

  /**
   * A token edit while a component is selected is ambiguous by construction: the user is looking at one
   * Card, and the token belongs to every component that reads it. Applying either reading silently is
   * wrong half the time, so the edit is HELD and the question asked. With nothing selected there is no
   * ambiguity and the write goes straight through.
   */
  const [pendingScope, setPendingScope] = useState<{ token: string; value: string } | null>(null);

  async function writeToken(token: string, value: string): Promise<void> {
    if (selectedComponent && (tokensInUse ?? {})[token] !== undefined) {
      setPendingScope({ token, value });
      return;
    }
    await commit(() => api.setThemeTokenOverride(project.path, token, value));
  }

  /** Apply the held edit once the user has said how far it reaches. */
  async function resolveScope(scope: "component" | "system"): Promise<void> {
    const p = pendingScope;
    setPendingScope(null);
    if (!p) return;
    if (scope === "system") {
      await commit(() => api.setThemeTokenOverride(project.path, p.token, p.value));
      return;
    }
    // The same token, redefined inside this component only — so every Card follows and a Button reading
    // it does not. Merged with any existing base so this never drops another property.
    await commit(async () => {
      const prior = await api.getThemeOverrides(project.path).catch(() => null);
      const base = prior?.components?.[selectedComponent as string]?.base ?? {};
      return api.setThemeComponentOverride(project.path, selectedComponent as string, {}, {
        ...base,
        [`--${p.token}`]: p.value,
      });
    });
  }

  /**
   * Add a token the selection uses but the design system lacks, at the value the page already gives it.
   *
   * Explicit and per-token: the design system is not modified because something was SELECTED. This closes
   * the drift in the direction the user actually works — they chose a value on the page, and the system
   * follows it — through the same creation path any other new token uses.
   */
  async function adoptToken(name: string, value: string): Promise<void> {
    await commit(() => api.createToken(project.path, name, value));
  }

  /** Remove a component's whole base override. An empty decl bag is how the store clears a target. */
  async function clearComponentOverride(component: string): Promise<void> {
    await commit(() => api.setThemeComponentOverride(project.path, component, {}, {}));
  }

  /** Choosing a family writes the stack AND records a Google family, so the font is fetched, not just named. */
  async function chooseFont(token: string, stack: string, google?: string): Promise<void> {
    await commit(() => api.setThemeFontFamily(project.path, token, stack, google));
  }

  /** A row's in-progress value, so the preview moves WHILE typing rather than after the write lands. */
  function draft(token: string, value: string): void {
    setDrafts((d) => ({ ...d, [token]: value }));
  }

  async function commit(write: () => Promise<unknown>): Promise<void> {
    setPending(true);
    try {
      await write();
      // The saved values are now authoritative — drop the drafts so the preview reflects disk, not a
      // stale keystroke.
      setDrafts({});
      await load();
      onEdited();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (error && !model) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[12px] text-vs-text-muted">
        <p>Couldn’t read this project’s design system.</p>
        <pre className="max-w-[40ch] whitespace-pre-wrap text-vs-text-secondary">{error}</pre>
      </div>
    );
  }
  if (!model) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const total = model.sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-1 border-b border-vs-border-subtle px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-vs-text-primary">Design system</span>
          {pending && <Spinner />}
        </div>
        <p className="text-[11px] leading-relaxed text-vs-text-muted">
          {model.designSource === "library" || model.designSource === "enterprise"
            ? "Edits are saved as your own overlay — the library’s own files are never modified."
            : "Edits are saved as your own overlay, layered on top of your token file."}
        </p>
      </div>

      {/* A theme-object library can't take the CSS overlay — say so and offer the real apply step. */}
      {model.needsThemeAgent && (
        <div className="m-3 flex flex-col gap-2 rounded-md border border-vs-border-default bg-vs-bg-elevated p-3">
          <p className="text-[11px] leading-relaxed text-vs-text-secondary">
            {model.componentLibrary ?? "This library"} themes through a theme object, so your edits are
            saved but need one apply step to reach it.
          </p>
          <button
            type="button"
            onClick={() => void customizeTheme()}
            disabled={customize.running}
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary transition-colors hover:border-vs-accent hover:text-vs-text-primary disabled:cursor-default disabled:opacity-50"
          >
            <Palette size={12} className={customize.running ? "animate-spin" : undefined} />
            {customize.running ? "Applying…" : "Customize theme"}
          </button>
        </div>
      )}

      {total > 0 && (
        <LivePreview
          preview={
            presetPreview
              ? (presetPreview as DesignPreview)
              : previewWithDrafts(model.preview, drafts)
          }
          pending={presetPreview ? "preset" : Object.keys(drafts).length > 0 ? "edit" : null}
        />
      )}

      <div className="flex items-center gap-1 border-b border-vs-border-subtle px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-vs-text-muted">Mode</span>
        <div className="ml-auto flex items-center gap-1">
          {([
            ["manual", "Manual"],
            ["presets", "Presets"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                mode === id
                  ? "bg-vs-accent text-white"
                  : "border border-vs-border-default text-vs-text-secondary hover:text-vs-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "presets" ? (
        <PresetsMode
          projectPath={project.path}
          onPreview={setPresetPreview}
          onApplied={() => {
            void load();
            onEdited();
          }}
        />
      ) : total === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-vs-text-muted">
          No design tokens found for this project yet. Once its token file resolves, its colors, type,
          spacing, borders and shadows appear here.
        </p>
      ) : (
        <div className="flex flex-col">
          {pendingScope && selectedComponent && (
            <ScopeQuestion
              token={pendingScope.token}
              value={pendingScope.value}
              component={selectedComponent}
              disabled={pending}
              onChoose={(scope) => void resolveScope(scope)}
              onCancel={() => setPendingScope(null)}
            />
          )}
          {selectedComponent && componentSections.length > 0 && (
            <section
              aria-label={`Applied styles: ${selectedComponent}`}
              className="border-b border-vs-border-default"
            >
              <div className="px-3 pb-1 pt-2">
                <div className="text-[10px] uppercase tracking-[0.06em] text-vs-text-muted">
                  Applied styles
                </div>
                <div className="text-[13px] font-semibold text-vs-text-primary">{selectedComponent}</div>
              </div>
              {componentSections.map((section) => (
                <div key={`applied-${section.section}`} className="pb-1">
                  <div className="flex items-baseline gap-1.5 px-3 pb-0.5">
                    <span className="text-[10px] uppercase tracking-[0.06em] text-vs-text-secondary">
                      {section.label}
                    </span>
                    <span className="font-mono text-[9.5px] text-vs-text-muted">{section.rows.length}</span>
                  </div>
                  <SectionBody
                    section={section}
                    drift={drift}
                    disabled={pending}
                    projectPath={project.path}
                    onWrite={writeToken}
                    onChooseFont={chooseFont}
                    onDraft={draft}
                    inUse={inUseSet}
                  />
                </div>
              ))}
            </section>
          )}
          {model.sections.map((section) => (
            <Section
              key={section.section}
              section={section}
              disabled={pending}
              drift={drift}
              projectPath={project.path}
              onWrite={writeToken}
              onChooseFont={chooseFont}
              onDraft={draft}
              inUse={inUseSet}
            />
          ))}
          <UnmappedTokens entries={unmapped} disabled={pending} onAdopt={adoptToken} />
          <ComponentOverrides
            entries={componentOverrides}
            disabled={pending}
            onClear={clearComponentOverride}
          />
        </div>
      )}

      {error && model && <p className="px-3 pb-3 text-[11px] text-vs-error">{error}</p>}
    </div>
  );
}

/**
 * A sample card drawn from the design system's CURRENT values, so the user can judge them together
 * without opening a screen — and see a preset land the moment it is applied.
 *
 * It draws with values resolved BY ROLE, not "the first token in each section". That distinction is the
 * whole reason this works: section order follows the token file, which on a real project made the accent
 * `--border-width` and the radius `--radius-none` — values of the wrong kind that no preset ever touches,
 * so the preview could neither look like the design system nor react to a change.
 *
 * It also NAMES the tokens it drew with, because rows follow the project and there is no canonical
 * "primary" to silently assume.
 */
function LivePreview({
  preview,
  pending,
}: {
  preview: DesignPreview;
  /** The card is showing something not yet saved — say which, so it is never mistaken for the truth. */
  pending: "preset" | "edit" | null;
}): React.JSX.Element {
  // The panel is dark, but the screens render light mode — show the LIGHT half, as the swatches do.
  const v = (x?: string): string | undefined => (x ? (parseLightDark(x)?.light ?? x) : undefined);
  const primary = v(preview.primary) ?? "#7C6FF0";
  const surface = v(preview.surface);
  const text = v(preview.text);
  const muted = v(preview.textMuted);
  const border = v(preview.border);
  const used = Object.values(preview.tokens);

  return (
    <div className="flex flex-col gap-1.5 border-b border-vs-border-subtle px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary">
          Live preview
        </span>
        <span className="text-[9px] text-vs-text-muted">
          {pending === "preset"
            ? "previewing a preset — not applied yet"
            : pending === "edit"
              ? "previewing your edit"
              : "reflects token values"}
        </span>
      </div>

      <div
        className={`p-3 ${pending ? "rounded ring-1 ring-vs-accent" : ""}`}
        style={{ background: v(preview.background), borderRadius: preview.radius, fontFamily: preview.fontFamily }}
      >
        <div
          className="flex flex-col gap-2 p-3"
          style={{
            background: surface,
            borderRadius: preview.radius,
            boxShadow: preview.shadow,
            border: border ? `1px solid ${border}` : undefined,
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: primary }} />
            <span className="text-[11px] font-medium" style={{ color: text }}>
              Sample card
            </span>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: muted ?? text }}>
            This preview uses your design system’s own values — change one and it follows.
          </p>
          <span
            className="w-fit px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ background: primary, borderRadius: preview.radius }}
          >
            Action
          </span>
        </div>
      </div>

      {used.length > 0 ? (
        <span className="truncate font-mono text-[9px] text-vs-text-muted" title={used.map((t) => `--${t}`).join(", ")}>
          using {used.map((t) => `--${t}`).join(", ")}
        </span>
      ) : (
        // Say so rather than showing an unstyled box the user has to puzzle over.
        <span className="text-[9px] leading-relaxed text-vs-text-muted">
          None of this design system’s tokens matched the roles the preview draws with, so it is showing
          defaults.
        </span>
      )}
    </div>
  );
}

function Section({
  section,
  disabled,
  drift,
  projectPath,
  onWrite,
  onChooseFont,
  onDraft,
  inUse,
}: {
  section: LibrarySection;
  disabled: boolean;
  drift: Map<string, TokenDrift>;
  projectPath: string;
  onWrite: (token: string, value: string) => Promise<void>;
  onChooseFont: (token: string, stack: string, google?: string) => Promise<void>;
  onDraft: (token: string, value: string) => void;
  inUse: ReadonlySet<string>;
}): React.JSX.Element {
  const drifted = section.rows.filter((r) => drift.has(r.token)).length;
  // A big section (Astryx ships 100+ colors) opens collapsed so the panel isn't a wall on first sight —
  // but a section carrying a screen difference opens, or the offer would be hidden behind a chevron.
  const [open, setOpen] = useState((section.rows.length > 0 && section.rows.length <= 12) || drifted > 0);
  return (
    <section className="border-b border-vs-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
      >
        <span className="text-[9px] text-vs-text-muted">{open ? "▾" : "▸"}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary">
          {section.label}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {drifted > 0 && (
            <span
              className="rounded-full bg-vs-accent px-1.5 text-[9px] font-medium text-white"
              title={`${drifted} value${drifted === 1 ? "" : "s"} differ from your screens`}
            >
              {drifted}
            </span>
          )}
          <span className="text-[10px] text-vs-text-muted">{section.rows.length}</span>
        </span>
      </button>
      {open &&
        (section.rows.length === 0 ? (
          // Say it plainly. An empty section is information — it means this design system doesn't define
          // that property — not something to hide or fill with invented rows.
          <p className="px-3 pb-2.5 text-[10px] leading-relaxed text-vs-text-muted">
            This design system defines no {section.label.toLowerCase()} tokens.
          </p>
        ) : (
          <SectionBody
            section={section}
            drift={drift}
            disabled={disabled}
            projectPath={projectPath}
            onWrite={onWrite}
            onChooseFont={onChooseFont}
            onDraft={onDraft}
            inUse={inUse}
          />
        ))}
    </section>
  );
}

/**
 * A token's name with the section's own prefix dropped — the section heading already says "Colors", so
 * repeating `color-` on all 106 rows spends width that the value needs.
 */
function shortName(token: string, section: string): string {
  const prefixes: Record<string, string[]> = {
    color: ["color-"],
    radius: ["radius-", "border-"],
    spacing: ["spacing-", "space-", "size-"],
    shadow: ["shadow-"],
    typography: ["font-"],
  };
  for (const p of prefixes[section] ?? []) if (token.startsWith(p) && token.length > p.length) return token.slice(p.length);
  return token;
}

/**
 * A section's rows, laid out for what they contain.
 *
 * Colours are a grid of square swatches: with 100+ of them, one full-width row each — swatch, a
 * `light-dark(#5433eb, #ebebeb)` input and a hint line — is several screens of scrolling to see a palette
 * that should be takeable in at a glance. The value only appears for the one swatch you open.
 *
 * Everything else — typography, spacing, borders and shadows — pairs up two to a row. A shadow's value is
 * long, so its input scrolls rather than showing the whole thing at once; the full value is in the title.
 */
function SectionBody({
  inUse,
  section,
  drift,
  disabled,
  projectPath,
  onWrite,
  onChooseFont,
  onDraft,
}: {
  section: LibrarySection;
  drift: Map<string, TokenDrift>;
  disabled: boolean;
  projectPath: string;
  onWrite: (token: string, value: string) => Promise<void>;
  onChooseFont: (token: string, stack: string, google?: string) => Promise<void>;
  onDraft: (token: string, value: string) => void;
  inUse: ReadonlySet<string>;
}): React.JSX.Element {
  const [openToken, setOpenToken] = useState<string | null>(null);
  const opened = section.rows.find((r) => r.token === openToken) ?? null;

  const editor = (row: LibraryRow): React.JSX.Element => (
    <Row
      key={row.token}
      row={row}
      section={section.section}
      drift={drift.get(row.token)}
      disabled={disabled}
      projectPath={projectPath}
      onWrite={onWrite}
      onChooseFont={onChooseFont}
      onDraft={onDraft}
    />
  );

  return (
    <div className="px-3 pb-3">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN[section.section] ?? 56}px, 1fr))` }}
      >
        {section.rows.map((row) => (
          <Fragment key={row.token}>
            <Tile
              row={row}
              section={section.section}
              drifted={drift.has(row.token)}
              selected={row.token === openToken}
              inUse={inUse.has(row.token)}
              onSelect={() => setOpenToken((t) => (t === row.token ? null : row.token))}
            />
            {/* The editor is a grid ITEM spanning every column, placed right after its own tile. Grid
                auto-placement then puts it on the next line — i.e. directly under the row the tile is in,
                whatever the panel's width and however many columns fit. Rendering it after the whole grid
                would drop it below the entire section, which on a 100-token palette is nowhere near what
                was clicked. */}
            {opened?.token === row.token && (
              <div style={{ gridColumn: "1 / -1" }} className="pb-1 pt-0.5">
                {editor(opened)}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** How wide a tile needs to be to show what it shows. Text samples need more room than a swatch. */
const TILE_MIN: Record<string, number> = {
  color: 46,
  shadow: 60,
  radius: 56,
  spacing: 76,
  typography: 92,
};

/**
 * One token, shown as the THING IT IS rather than as its CSS text — a filled square for a colour, a
 * shadow cast on a surface, a corner for a radius, a bar for a spacing step, type set at its own size.
 *
 * Reading `0 2px 4px light-dark(oklch(0 0 0 / 5%), oklch(0 0 0 / 35%))` tells you almost nothing about
 * what that shadow looks like; seeing it tells you immediately. Clicking a tile opens its editor below
 * that tile's row, so the value is only spelled out for the one being changed.
 *
 * Anything that cannot be drawn honestly (an alias, an unparseable value) falls back to showing the value
 * as text — better a plain reading than a picture that misrepresents it.
 */
function Tile({
  row,
  section,
  drifted,
  selected,
  inUse,
  onSelect,
}: {
  row: LibraryRow;
  section: string;
  drifted: boolean;
  selected: boolean;
  /** This value composes the element currently selected on the canvas. */
  inUse: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={inUse ? `--${row.token}\n${row.value}\nUsed by the selected element` : `--${row.token}\n${row.value}`}
      aria-label={`${row.token}: ${row.value}${inUse ? " · in use by the selection" : ""}`}
      aria-pressed={selected}
      className="flex min-w-0 flex-col gap-1 text-left"
    >
      <span
        className={`flex h-10 w-full items-center justify-center overflow-hidden rounded border transition-shadow ${
          selected ? "border-vs-accent ring-1 ring-vs-accent" : "border-vs-border-default"
        } ${drifted ? "ring-1 ring-vs-accent ring-offset-1 ring-offset-vs-bg-primary" : ""} ${
          section === "color" ? "" : "bg-vs-bg-surface"
        }`}
        style={section === "color" ? { background: lightOf(row.value) } : undefined}
      >
        <TileArt section={section} row={row} />
      </span>
      <span
        className={`truncate text-[8px] leading-tight ${
          inUse ? "font-semibold text-vs-text-primary" : "text-vs-text-muted"
        }`}
      >
        {inUse && <span aria-hidden>• </span>}
        {shortName(row.token, section)}
      </span>
    </button>
  );
}

/** The light half of a `light-dark()` pair — the panel is dark, but the screens render light mode. */
function lightOf(value: string): string {
  return parseLightDark(value)?.light ?? value;
}

/** Parse a CSS length to px for drawing. `null` when it isn't a plain length (an alias, `calc()`, …). */
function px(value: string): number | null {
  const m = value.trim().match(/^(-?(?:\d*\.)?\d+)(px|rem|em)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

function TileArt({ section, row }: { section: string; row: LibraryRow }): React.JSX.Element | null {
  const value = lightOf(row.value);

  // A colour fills its whole tile — the tile IS the swatch.
  if (section === "color") return null;

  if (section === "shadow") {
    // The shadow needs something to fall on and room to fall into, so it is a small raised card inside
    // the tile rather than the tile itself.
    return <span className="h-5 w-8 rounded-sm bg-vs-bg-elevated" style={{ boxShadow: value }} />;
  }

  if (section === "radius") {
    const r = px(value);
    // Drawn on a corner: a bordered box whose rounding IS the value, so 0 and 9999px are instantly
    // distinguishable in a way two numbers are not.
    return r === null ? (
      <Literal value={value} />
    ) : (
      <span
        className="h-6 w-10 border-2 border-vs-text-secondary"
        style={{ borderRadius: Math.min(r, 24) }}
      />
    );
  }

  if (section === "spacing") {
    const n = px(value);
    if (n === null) return <Literal value={value} />;
    return (
      <span className="flex w-full items-center gap-1 px-1.5">
        {/* The bar is the step, to scale against its siblings — the whole point of a spacing SCALE is the
            relationship between steps, which a column of numbers hides. */}
        <span className="h-2 rounded-sm bg-vs-accent" style={{ width: Math.max(2, Math.min(n, 44)) }} />
        <span className="ml-auto shrink-0 font-mono text-[9px] text-vs-text-muted">{value}</span>
      </span>
    );
  }

  // Typography: set the sample in whatever the token actually controls.
  const n = row.token.toLowerCase();
  if (/family|typeface/.test(n)) return <span style={{ fontFamily: value, fontSize: 15 }}>Aa</span>;
  if (/weight/.test(n)) return <span style={{ fontWeight: value as React.CSSProperties["fontWeight"], fontSize: 15 }}>Aa</span>;
  const size = px(value);
  if (size !== null && /size|font/.test(n)) {
    // Set at its own size, capped to the tile so a display size doesn't blow the grid apart. The real
    // value is in the tooltip and in the editor.
    return (
      <span className="leading-none" style={{ fontSize: Math.min(size, 26) }}>
        Aa
      </span>
    );
  }
  return <Literal value={value} />;
}

/** The honest fallback: show the value when it cannot be drawn as itself. */
function Literal({ value }: { value: string }): React.JSX.Element {
  return <span className="truncate px-1 font-mono text-[9px] text-vs-text-secondary">{value}</span>;
}

/** One token: name, its live value, and the right control for what that value actually is. */
function Row({
  row,
  section,
  drift,
  disabled,
  projectPath,
  onWrite,
  onChooseFont,
  onDraft,
}: {
  row: LibraryRow;
  section: string;
  /** This token's value in the screens, when it differs — an offer, never applied on its own. */
  drift?: TokenDrift;
  disabled: boolean;
  projectPath: string;
  onWrite: (token: string, value: string) => Promise<void>;
  onChooseFont: (token: string, stack: string, google?: string) => Promise<void>;
  /** Report the in-progress value so the Live Preview follows the edit as it is typed. */
  onDraft: (token: string, value: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(row.value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt a fresh value from the reader, but never clobber what the user is mid-way through typing.
  useEffect(() => {
    if (timer.current === null) setDraft(row.value);
  }, [row.value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const [picking, setPicking] = useState(false);
  const valid = isValidStyleValue(row.control, draft);
  const ld = parseLightDark(draft);
  // A family is CHOSEN from the picker, never typed — typing is how you get a silent fallback.
  const isFamily = /font.*family|family|typeface/i.test(row.token) && isFontFamilyValue(row.value);

  function change(next: string): void {
    setDraft(next);
    // Tell the panel immediately — the preview should move with the keystroke, not 400ms later when the
    // write lands.
    if (isValidStyleValue(row.control, next)) onDraft(row.token, next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (isValidStyleValue(row.control, next) && next.trim() !== row.value.trim()) onWrite(row.token, next.trim());
    }, 400);
  }

  function flush(): void {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (valid && draft.trim() !== row.value.trim()) void onWrite(row.token, draft.trim());
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="truncate font-mono text-[10px] text-vs-text-secondary"
          title={`--${row.token}${row.uses ? ` · ${row.uses} use${row.uses === 1 ? "" : "s"}` : ""}`}
        >
          --{row.token}
        </span>
        {row.uses > 0 && (
          <span className="shrink-0 text-[9px] text-vs-text-muted" title="Component references to this token">
            {row.uses} use{row.uses === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {isFamily ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPicking((v) => !v)}
            className="flex items-center gap-2 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-left transition-colors hover:border-vs-accent disabled:opacity-50"
          >
            <span className="min-w-0 flex-1 truncate text-[12px] text-vs-text-primary" style={{ fontFamily: row.value }}>
              {leadFamily(row.value)}
            </span>
            <span className="shrink-0 text-[9px] text-vs-text-muted">{picking ? "▴" : "▾"}</span>
          </button>
          {picking && (
            <FontPicker
              value={leadFamily(row.value)}
              projectPath={projectPath}
              disabled={disabled}
              onClose={() => setPicking(false)}
              onChoose={(stack, google) => {
                setPicking(false);
                void onChooseFont(row.token, stack, google);
              }}
            />
          )}
        </div>
      ) : (
      <div className="flex items-center gap-1.5">
        {row.control === "color" && (
          <input
            type="color"
            aria-label={`${row.token} color`}
            value={swatchHex(draft)}
            disabled={disabled}
            // A light-dark() pair keeps its dark half — editing light mode must not destroy dark mode.
            onChange={(e) => change(applyLightDark(draft, e.target.value.toUpperCase()))}
            onBlur={flush}
            className="h-[26px] w-[26px] shrink-0 cursor-pointer rounded border border-vs-border-default bg-vs-bg-surface p-0.5 disabled:opacity-50"
          />
        )}
        <input
          aria-label={row.token}
          value={draft}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
          // Same treatment as the Design Attributes tab's fields, so the two panels read as one app.
          title={draft}
          className={`min-w-0 flex-1 rounded border bg-vs-bg-surface px-2 py-1 font-mono text-[12px] text-vs-text-primary outline-none focus:border-vs-accent disabled:opacity-50 ${
            valid ? "border-vs-border-default" : "border-vs-error"
          }`}
        />
      </div>
      )}
      {ld && (
        <span className="text-[9px] text-vs-text-muted">Light/dark pair — the swatch edits light.</span>
      )}
      {!valid && <span className="text-[9px] text-vs-error">Not a valid {row.control} value.</span>}
      {drift && (
        <div className="flex items-center gap-1.5 rounded border border-vs-border-strong bg-vs-bg-elevated px-1.5 py-1">
          {row.control === "color" && (
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-sm border border-vs-border-default"
              style={{ background: parseLightDark(drift.screenValue)?.light ?? drift.screenValue }}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-[9px] text-vs-text-muted">
            Your screens use <span className="font-mono text-vs-text-secondary">{drift.screenValue}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onWrite(row.token, drift.adoptValue)}
            className="shrink-0 cursor-pointer rounded border border-vs-border-strong px-1.5 py-px text-[9px] text-vs-text-secondary transition-colors hover:border-vs-accent hover:text-vs-text-primary disabled:cursor-default disabled:opacity-50"
          >
            Adopt
          </button>
        </div>
      )}
    </div>
  );
}


/**
 * Per-component overrides currently laid over the design system (change: scoped-style-edits).
 *
 * These apply to every instance on every page, and until now nothing displayed them — a project could
 * carry `[data-component="Button"] { border-radius: 0 }` forever with no screen that showed it and no way
 * to undo it. An effect with no visible cause is indistinguishable from a bug, so the list exists even
 * when it is empty of anything the current session wrote.
 *
 * Rendered only when there is something to show: an always-present empty section would imply overrides
 * are a normal part of a design system rather than an exception laid on top of one.
 */
function ComponentOverrides({
  entries,
  disabled,
  onClear,
}: {
  entries: [string, Record<string, string>][];
  disabled: boolean;
  onClear: (component: string) => Promise<void>;
}): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <div className="border-t border-vs-border-default px-3 py-2">
      <div className="pb-1.5 text-[10px] uppercase tracking-[0.06em] text-vs-text-muted">
        Component overrides
      </div>
      <div className="flex flex-col gap-1">
        {entries.map(([component, decls]) => (
          <div
            key={component}
            className="flex items-start justify-between gap-2 rounded border border-vs-border-default px-2 py-1.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[11.5px] text-vs-text-primary">{component}</span>
              <span className="truncate font-mono text-[10px] text-vs-text-muted">
                {Object.entries(decls)
                  // A token redefined for this component reads as the token, because that is what it is —
                  // the same name the design system uses, given a different value inside this component.
                  .map(([prop, val]) => (prop.startsWith("--") ? `${prop} = ${val}` : `${prop}: ${val}`))
                  .join("  ·  ")}
              </span>
            </div>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Clear the ${component} override`}
              onClick={() => void onClear(component)}
              className="shrink-0 rounded border border-vs-border-default px-1.5 py-0.5 text-[10px] text-vs-text-muted transition-colors hover:border-vs-border-strong hover:text-vs-text-secondary disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * Tokens the selection uses that this design system does not define (change: scoped-style-edits).
 *
 * Without this the panel answers "what is this component made of?" with silence for every property built
 * on a token the page invented — and silence reads as a broken panel rather than as the drift it is. A
 * light page routinely declares its own `:root`, so this is the common case, not the exotic one.
 *
 * Listed apart from the marked rows so the two are never confused: those ARE the design system, these are
 * values living outside it.
 */
function UnmappedTokens({
  entries,
  disabled,
  onAdopt,
}: {
  entries: [string, string][];
  disabled: boolean;
  onAdopt: (name: string, value: string) => Promise<void>;
}): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <section
      aria-label="Used here, not in your design system"
      className="border-t border-vs-border-default px-3 py-2"
    >
      <div className="pb-1 text-[10px] uppercase tracking-[0.06em] text-vs-text-muted">
        Used here · not in your design system
      </div>
      <p className="pb-1.5 text-[9.5px] leading-tight text-vs-text-muted">
        This screen resolves these through values your design system does not define.
      </p>
      <div className="flex flex-col gap-1">
        {entries.map(([name, value]) => (
          <div
            key={name}
            className="flex items-center justify-between gap-2 rounded border border-dashed border-vs-border-strong px-2 py-1.5"
          >
            <span className="min-w-0 truncate font-mono text-[10px] text-vs-text-secondary">
              {`--${name}`}
              <span className="text-vs-text-muted">{`  ·  ${value}`}</span>
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Add --${name} to the design system`}
              onClick={() => void onAdopt(name, value)}
              className="shrink-0 rounded border border-vs-border-default px-1.5 py-0.5 text-[10px] text-vs-text-muted transition-colors hover:border-vs-accent hover:text-vs-text-secondary disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}


/**
 * How far a token edit made from a selected component should reach (change: scoped-style-edits).
 *
 * Asked rather than assumed. The user is looking at one Card; the token belongs to every component that
 * reads it. Guessing is wrong half the time, and the wrong guess is invisible — the Card changes either
 * way, and only the components the user was not looking at reveal which reading was taken.
 *
 * Both options say what they affect, so the choice is made on consequences rather than on wording.
 */
function ScopeQuestion({
  token,
  value,
  component,
  disabled,
  onChoose,
  onCancel,
}: {
  token: string;
  value: string;
  component: string;
  disabled: boolean;
  onChoose: (scope: "component" | "system") => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <div
      role="alertdialog"
      aria-label={`Apply --${token}`}
      className="border-b border-vs-border-default bg-vs-bg-elevated px-3 py-2"
    >
      <div className="pb-0.5 font-mono text-[10px] text-vs-text-secondary">{`--${token} → ${value}`}</div>
      <p className="pb-1.5 text-[10px] leading-tight text-vs-text-muted">Apply this change to…</p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChoose("component")}
          className="rounded border border-vs-accent bg-vs-accent-muted px-1.5 py-0.5 text-[10px] text-vs-text-primary disabled:opacity-50"
        >
          {`Only ${component}s`}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChoose("system")}
          className="rounded border border-vs-border-default px-1.5 py-0.5 text-[10px] text-vs-text-secondary hover:border-vs-border-strong disabled:opacity-50"
        >
          The whole design system
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          aria-label="Cancel this change"
          className="rounded px-1.5 py-0.5 text-[10px] text-vs-text-muted hover:text-vs-text-secondary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      <p className="pt-1 text-[9.5px] leading-tight text-vs-text-muted">
        {`Only ${component}s changes every ${component} and leaves other components reading --${token} alone.`}
      </p>
    </div>
  );
}
