import { useEffect, useMemo, useState } from "react";
import type {
  EnvCheck,
  FigmaVariable,
  FileSnapshot,
  InspectorToken,
  Project,
  TokenSource,
  TokenType,
  TokenUsage,
} from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Spinner } from "../components/ui";
import { RunPanel } from "../components/RunPanel";
import { ProjectRail, projectRailItems } from "../components/ProjectRail";

/** Export Figma variables to a cache file so the cockpit can reconcile locally. Read-only w.r.t. code. */
const FIGMA_SYNC_PROMPT = [
  "Export this design system's Figma variables so VortSpec can reconcile them with the token file.",
  "",
  "1. Using the connected Figma MCP (Desktop Bridge), fetch ALL design variables with values resolved",
  "   for the default/primary mode. Prefer a bulk call (e.g. figma_get_variables / get_variable_defs);",
  "   page through collections if the file is large.",
  "2. Resolve each variable to a CONCRETE value (hex for colors, px/number for dimensions) — never an",
  "   alias to another variable.",
  "3. Write the result to `.vortspec/figma-variables.json` as a JSON array of objects:",
  '   { "name": "<variable name, e.g. color/primary>", "resolvedValue": "<concrete value>",',
  '     "type": "color|spacing|radius|typography|shadow|other", "collection": "<optional>" }.',
  "4. Write ONLY `.vortspec/figma-variables.json`. Do not modify the token file, component sources, or",
  "   any other file, and do not change anything in Figma.",
].join("\n");

/** Rename a token across the token file + every component reference (var(), Tailwind arbitrary, plain). */
function renamePrompt(oldName: string, newName: string): string {
  return [
    `Rename the design token \`--${oldName}\` to \`--${newName}\` across this project.`,
    `1. In the token file, rename the \`--${oldName}\` custom-property declaration to \`--${newName}\`, keeping its value and any comment.`,
    `2. Update EVERY reference under the component directory — \`var(--${oldName})\`, Tailwind arbitrary values (\`bg-[--${oldName}]\`, \`text-[var(--${oldName})]\`), and any other \`--${oldName}\` mention — to \`--${newName}\`.`,
    `3. Change nothing else: no values, no other tokens. Preserve formatting.`,
  ].join("\n");
}

/** Delete a token, re-pointing its references at the closest existing token (never a hardcoded value). */
function deletePrompt(name: string): string {
  return [
    `Delete the design token \`--${name}\` from this project safely.`,
    `1. Find every reference to \`--${name}\` in the component sources under the component directory.`,
    `2. Replace each with the closest EXISTING token by name/role so nothing hardcodes a raw value; if truly none fits, leave a clear TODO comment instead of a literal.`,
    `3. Once no references remain, remove the \`--${name}\` declaration from the token file.`,
    `4. Touch nothing else. Preserve formatting.`,
  ].join("\n");
}

const TYPE_ORDER: TokenType[] = ["color", "typography", "spacing", "radius", "shadow", "other"];
const TYPE_LABEL: Record<TokenType, string> = {
  color: "Color",
  typography: "Typography",
  spacing: "Spacing",
  radius: "Radius",
  shadow: "Shadow",
  other: "Other",
};
const SOURCE: Record<TokenSource, { label: string; dot: string; text: string; line: string }> = {
  "figma-variable": {
    label: "Figma variable",
    dot: "#30A46C",
    text: "text-vs-success",
    line: "From Figma variables (authoritative)",
  },
  "generated-code": {
    label: "From code",
    dot: "#FFB224",
    text: "text-vs-warning",
    line: "Read from the generated token file",
  },
  "hand-edited": {
    label: "Hand-edited",
    dot: "#7C6FF0",
    text: "text-vs-accent",
    line: "Edited by you in the Inspector",
  },
};

/**
 * Design System Inspector — Tokens page (design: "Tokens.dc.html", adapted to
 * v2). Left rail + grouped token table + a detail drawer that opens on selection
 * with the token's value editor (gated, written to the token file), source line,
 * and where-used listing. All file-derived; no IR store.
 */
export function Inspector({
  project,
  onBack,
  onOpenPreview,
  onOpenRun,
  onOpenHistory,
  onOpenManifest,
}: {
  project: Project;
  onBack: () => void;
  onOpenPreview: () => void;
  onOpenRun: () => void;
  onOpenHistory: () => void;
  onOpenManifest: () => void;
}): React.JSX.Element {
  const [tokens, setTokens] = useState<InspectorToken[] | null>(null);
  const [usage, setUsage] = useState<Record<string, TokenUsage[]>>({});
  const [tokenFile, setTokenFile] = useState<string | null>(null);
  const [segment, setSegment] = useState<TokenType | "all">("all");
  const [query, setQuery] = useState("");
  const [codeOnly, setCodeOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [figmaOnly, setFigmaOnly] = useState<FigmaVariable[]>([]);
  const [figmaSynced, setFigmaSynced] = useState(false);
  const [figmaEnv, setFigmaEnv] = useState<EnvCheck | null>(null);

  // Gated rename/delete via a scoped Claude Code run (touches the token file +
  // component sources); snapshotted before the run so it can be reverted.
  const tokenMod = useAgentRun();
  const [snapshot, setSnapshot] = useState<FileSnapshot[] | null>(null);
  const [modReview, setModReview] = useState(false);
  const [modLabel, setModLabel] = useState("");

  // Figma sync: a scoped Claude Code run exports variables → the cockpit
  // reconciles locally on the next read. VortSpec never talks to Figma directly.
  const figmaSync = useAgentRun();

  async function reloadTokens(): Promise<void> {
    const r = await api.inspectorTokens(project.path);
    setTokens(r.tokens);
    setUsage(r.usage);
    setTokenFile(r.tokenFile);
    setFigmaOnly(r.figmaOnly);
    setFigmaSynced(r.figmaSynced);
  }

  useEffect(() => {
    void reloadTokens();
    void api.verifyFigmaMcp().then(setFigmaEnv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  async function syncFigma(): Promise<void> {
    await figmaSync.start({ prompt: FIGMA_SYNC_PROMPT, cwd: project.path, bypassPermissions: true });
  }
  // When the export run finishes, re-read tokens (now reconciled against Figma).
  useEffect(() => {
    if (figmaSync.model.status !== "done") return;
    void reloadTokens().then(() => flash("Reconciled with Figma variables"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figmaSync.model.status]);

  function flash(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function runTokenMod(label: string, prompt: string): Promise<void> {
    setModReview(false);
    setModLabel(label);
    setSnapshot(await api.snapshotTokenScope(project.path));
    await tokenMod.start({
      prompt,
      cwd: project.path,
      allowedTools: ["Read", "Edit", "Write"],
      bypassPermissions: true,
    });
  }
  function requestRename(name: string, newName: string): void {
    const next = newName.trim().replace(/^--/, "");
    if (!next || next === name) return;
    void runTokenMod(`Rename --${name} → --${next}`, renamePrompt(name, next));
  }
  function requestDelete(name: string): void {
    void runTokenMod(`Delete --${name}`, deletePrompt(name));
  }

  // When the run finishes, re-read tokens (renames/deletes changed the set) and
  // enter review — applied but revertable.
  useEffect(() => {
    if (tokenMod.model.status !== "done") return;
    void reloadTokens();
    setModReview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenMod.model.status]);

  async function revertTokenMod(): Promise<void> {
    if (snapshot) await api.restoreFiles(project.path, snapshot);
    await reloadTokens();
    setSnapshot(null);
    setModReview(false);
    setSelected(null);
    tokenMod.reset();
    flash("Reverted — token file and components restored");
  }
  function keepTokenMod(): void {
    setSnapshot(null);
    setModReview(false);
    setSelected(null);
    tokenMod.reset();
    flash(modLabel + " · kept");
  }
  // Cancel a running token modification. A half-applied rename/delete is unsafe,
  // so restore the pre-run snapshot (token file + component sources) on cancel.
  async function cancelTokenMod(): Promise<void> {
    await tokenMod.cancel();
    if (snapshot) await api.restoreFiles(project.path, snapshot);
    await reloadTokens();
    setSnapshot(null);
    setModReview(false);
    setSelected(null);
    tokenMod.reset();
    flash("Canceled — restored the token file and components");
  }

  const groups = useMemo(() => {
    if (!tokens) return [];
    const q = query.trim().toLowerCase();
    const filtered = tokens.filter(
      (t) =>
        (segment === "all" || t.type === segment) &&
        (!codeOnly || t.source === "generated-code") &&
        (q === "" || t.name.toLowerCase().includes(q) || t.resolvedValue.toLowerCase().includes(q)),
    );
    return TYPE_ORDER.map((type) => ({
      type,
      items: filtered.filter((t) => t.type === type),
    })).filter((g) => g.items.length > 0);
  }, [tokens, query, segment, codeOnly]);

  const total = tokens?.length ?? 0;
  const resultCount = groups.reduce((a, g) => a + g.items.length, 0);
  const selectedToken = tokens?.find((t) => t.name === selected) ?? null;
  const driftCount = tokens?.filter((t) => t.drift === "drifted").length ?? 0;
  const inSyncCount = tokens?.filter((t) => t.drift === "in-sync").length ?? 0;
  const figmaConnected = figmaEnv?.status === "pass";

  async function saveValue(name: string, value: string): Promise<void> {
    const r = await api.setTokenValue(project.path, name, value);
    setTokens(r.tokens);
    setUsage(r.usage);
    flash(`Saved --${name} to ${tokenFile ?? "token file"}`);
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={projectRailItems(
          "tokens",
          {
            onFlow: onBack,
            onRun: onOpenRun,
            onPlayground: onOpenPreview,
            onTokens: () => undefined,
            onManifest: onOpenManifest,
            onHistory: onOpenHistory,
          },
          { tokens: <span className="font-mono text-[11px] text-vs-text-muted">{total}</span> },
        )}
      />

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none flex-col gap-3.5 border-b border-vs-border-default px-6 pb-3 pt-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Tokens</h1>
            <span className="font-mono text-xs text-vs-text-muted">
              {total} tokens
              {tokenFile && <span> · {tokenFile}</span>}
            </span>
            <div className="flex-1" />
            <FigmaSyncButton
              connected={figmaConnected}
              running={figmaSync.running}
              synced={figmaSynced}
              onSync={() => void syncFigma()}
              onConnect={() => figmaEnv?.fix?.url && void api.openInstall(figmaEnv.fix.url)}
            />
          </div>
          {figmaSynced && (total > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-vs-border-default bg-vs-bg-surface px-3 py-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wide text-vs-text-muted">
                Figma reconciliation
              </span>
              <span className="flex items-center gap-1.5 text-vs-text-secondary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-success" />
                {inSyncCount} in sync
              </span>
              <span className="flex items-center gap-1.5 text-vs-text-secondary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-warning" />
                {driftCount} drifted
              </span>
              <span className="flex items-center gap-1.5 text-vs-text-secondary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-accent" />
                {figmaOnly.length} Figma-only
              </span>
              {figmaOnly.length > 0 && (
                <span className="text-vs-text-muted">
                  · missing in code:{" "}
                  <span className="font-mono text-vs-text-secondary">
                    {figmaOnly.slice(0, 4).map((v) => v.name).join(", ")}
                    {figmaOnly.length > 4 ? ` +${figmaOnly.length - 4}` : ""}
                  </span>
                </span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-0.5 rounded-lg border border-vs-border-default bg-vs-bg-surface p-0.5">
              <Segment active={segment === "all"} onClick={() => setSegment("all")}>
                All
              </Segment>
              {TYPE_ORDER.map((t) => (
                <Segment key={t} active={segment === t} onClick={() => setSegment(t)}>
                  {TYPE_LABEL[t]}
                </Segment>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tokens…"
              className="w-52 rounded-md border border-vs-border-default bg-vs-bg-surface px-2.5 py-1.5 text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
            />
            <button
              onClick={() => setCodeOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                codeOnly
                  ? "border-vs-accent bg-vs-bg-elevated text-vs-text-primary"
                  : "border-vs-border-default bg-vs-bg-surface text-vs-text-secondary hover:border-vs-border-strong"
              }`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-warning" />
              From code only
              {codeOnly && <span className="ml-0.5 text-vs-text-secondary">×</span>}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          {tokens === null ? (
            <div className="flex items-center gap-2 p-6 text-sm text-vs-text-secondary">
              <Spinner /> Reading tokens…
            </div>
          ) : total === 0 ? (
            <Empty text="No tokens found. Run the design-system stage to extract them." />
          ) : resultCount === 0 ? (
            <div className="py-16 text-center text-vs-text-muted">
              <p className="mb-2 text-[13px]">No tokens match</p>
              <button
                onClick={() => {
                  setQuery("");
                  setSegment("all");
                  setCodeOnly(false);
                }}
                className="text-xs text-vs-accent underline hover:text-vs-text-primary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.type}>
                <div className="sticky top-0 z-[3] flex items-baseline gap-2 border-b border-vs-border-default bg-vs-bg-primary px-6 pb-2 pt-4">
                  <span className="text-[15px] font-semibold">{TYPE_LABEL[g.type]}</span>
                  <span className="font-mono text-[11px] text-vs-text-muted">
                    {g.items.length} tokens
                  </span>
                </div>
                {g.items.map((t) => (
                  <TokenRow
                    key={t.name}
                    token={t}
                    selected={t.name === selected}
                    onSelect={() => setSelected(t.name)}
                    onCopy={(text, what) => {
                      void navigator.clipboard?.writeText(text);
                      flash(`Copied ${what}`);
                    }}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Detail drawer */}
      {selectedToken && (
        <TokenDrawer
          key={selectedToken.name}
          token={selectedToken}
          usage={usage[selectedToken.name] ?? []}
          tokenFile={tokenFile}
          busy={tokenMod.running}
          onClose={() => setSelected(null)}
          onSave={saveValue}
          onRename={requestRename}
          onDelete={requestDelete}
        />
      )}

      {/* Gated rename/delete run — modal with live progress + Keep/Revert */}
      {(tokenMod.running || modReview) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex max-h-[80vh] w-[560px] flex-col gap-3 rounded-xl border border-vs-border-strong bg-vs-bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-vs-text-primary">{modLabel}</span>
              <span className="font-mono text-[11px] text-vs-text-muted">Claude Code · gated</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RunPanel model={tokenMod.model} onSend={tokenMod.send} canChat={tokenMod.canChat} />
            </div>
            {tokenMod.running && !modReview && (
              <div className="flex items-center justify-end border-t border-vs-border-default pt-3">
                <button
                  onClick={() => void cancelTokenMod()}
                  className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:border-vs-error hover:text-vs-error"
                >
                  Cancel &amp; revert
                </button>
              </div>
            )}
            {modReview && (
              <div className="flex items-center gap-3 border-t border-vs-border-default pt-3">
                <span className="flex-1 text-[11px] text-vs-text-muted">
                  Review the change, then keep or revert. Revert restores the token file and every
                  component source.
                </span>
                <button
                  onClick={() => void revertTokenMod()}
                  className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
                >
                  Revert
                </button>
                <button
                  onClick={keepTokenMod}
                  className="rounded-lg bg-vs-accent px-4 py-2 text-xs font-medium text-white hover:brightness-110"
                >
                  Keep change
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Figma export run — progress only (read-only w.r.t. code, so no gate) */}
      {(figmaSync.running || figmaSync.model.status === "error") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex max-h-[80vh] w-[560px] flex-col gap-3 rounded-xl border border-vs-border-strong bg-vs-bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-vs-text-primary">
                Syncing Figma variables
              </span>
              <span className="font-mono text-[11px] text-vs-text-muted">Claude Code · Figma MCP</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RunPanel model={figmaSync.model} />
            </div>
            <div className="flex items-center justify-end border-t border-vs-border-default pt-3">
              {figmaSync.running ? (
                <button
                  onClick={() => void figmaSync.cancel()}
                  className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:border-vs-error hover:text-vs-error"
                >
                  Cancel sync
                </button>
              ) : (
                <button
                  onClick={() => figmaSync.reset()}
                  className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-vs-border-strong bg-vs-bg-elevated px-4 py-2.5 text-xs text-vs-text-primary shadow-lg">
          <span className="text-vs-success">✓</span>
          <span className="font-mono">{toast}</span>
        </div>
      )}
    </div>
  );
}

/** Sync-from-Figma action, gated on the Desktop Bridge being connected. */
function FigmaSyncButton({
  connected,
  running,
  synced,
  onSync,
  onConnect,
}: {
  connected: boolean;
  running: boolean;
  synced: boolean;
  onSync: () => void;
  onConnect: () => void;
}): React.JSX.Element {
  if (!connected) {
    return (
      <button
        onClick={onConnect}
        title="Figma MCP is not connected — reconciliation needs the Desktop Bridge"
        className="flex items-center gap-1.5 rounded-full border border-vs-border-default bg-vs-bg-surface px-3 py-1 text-xs text-vs-text-muted hover:border-vs-border-strong hover:text-vs-text-secondary"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-text-muted" />
        Connect Figma to reconcile
      </button>
    );
  }
  return (
    <button
      onClick={onSync}
      disabled={running}
      className="flex items-center gap-1.5 rounded-full border border-vs-accent bg-vs-bg-elevated px-3 py-1 text-xs text-vs-text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-success" />
      {running ? "Syncing…" : synced ? "Re-sync from Figma" : "Sync from Figma"}
    </button>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="m-6 rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-10 text-center text-sm text-vs-text-muted">
      {text}
    </div>
  );
}

function TokenRow({
  token,
  selected,
  onSelect,
  onCopy,
}: {
  token: InspectorToken;
  selected: boolean;
  onSelect: () => void;
  onCopy: (text: string, what: string) => void;
}): React.JSX.Element {
  const [menu, setMenu] = useState(false);
  const src = SOURCE[token.source];
  return (
    <div
      onClick={onSelect}
      style={selected ? { boxShadow: "inset 2px 0 0 #7C6FF0" } : undefined}
      className={`relative flex h-11 cursor-pointer items-center gap-3 border-b border-vs-border-default pl-[22px] pr-5 ${
        selected ? "bg-vs-bg-elevated" : "hover:bg-vs-bg-hover"
      }`}
    >
      <Preview token={token} />
      <span className="w-[210px] shrink-0 truncate font-mono text-xs text-vs-text-primary">
        {token.name}
      </span>
      <span className="w-40 shrink-0 truncate font-mono text-xs text-vs-text-secondary">
        {token.resolvedValue}
      </span>
      <span className="flex w-24 shrink-0 items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: src.dot }} />
        <span className="text-xs text-vs-text-secondary">{src.label}</span>
      </span>
      <span className="flex-1" />
      {token.drift === "drifted" ? (
        <span
          title={`Figma: ${token.figmaValue}`}
          className="rounded-full border border-vs-warning-border bg-vs-warning-muted px-1.5 py-0.5 text-[10px] font-medium text-vs-warning"
        >
          ≠ Figma
        </span>
      ) : token.drift === "in-sync" ? (
        <span title="Matches the Figma variable" className="text-[10px] text-vs-success">
          ✓ Figma
        </span>
      ) : null}
      <span className="font-mono text-xs text-vs-text-muted">
        {token.uses} {token.uses === 1 ? "use" : "uses"}
      </span>
      <span className="relative shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenu((v) => !v);
          }}
          className="rounded px-1.5 py-1 leading-none tracking-widest text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary"
        >
          ⋯
        </button>
        {menu && (
          <div
            className="absolute right-0 top-7 z-30 w-40 rounded-lg border border-vs-border-strong bg-vs-bg-elevated p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem onClick={() => { onSelect(); setMenu(false); }}>Edit</MenuItem>
            <MenuItem onClick={() => { onCopy(`--${token.name}`, "name"); setMenu(false); }}>
              Copy name
            </MenuItem>
            <MenuItem onClick={() => { onCopy(token.resolvedValue, "value"); setMenu(false); }}>
              Copy value
            </MenuItem>
          </div>
        )}
      </span>
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left text-xs text-vs-text-primary hover:bg-vs-border-default"
    >
      {children}
    </button>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────

function TokenDrawer({
  token,
  usage,
  tokenFile,
  busy,
  onClose,
  onSave,
  onRename,
  onDelete,
}: {
  token: InspectorToken;
  usage: TokenUsage[];
  tokenFile: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, value: string) => Promise<void>;
  onRename: (name: string, newName: string) => void;
  onDelete: (name: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(token.rawValue);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(token.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const src = SOURCE[token.source];
  const isColor = token.type === "color";
  const dirty = value.trim() !== token.rawValue.trim();
  const colorHex = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#000000";

  async function save(): Promise<void> {
    if (!dirty) return;
    setSaving(true);
    await onSave(token.name, value);
    setSaving(false);
  }

  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-vs-border-default bg-vs-bg-surface"
      style={{ animation: "vsFade 0.18s ease" }}
    >
      <div className="flex items-center justify-between border-b border-vs-border-default px-4 pb-3 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
          Token details
        </span>
        <button
          onClick={onClose}
          className="rounded px-1.5 py-1 leading-none text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <Field label="Name">
          <div className="rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 font-mono text-xs text-vs-text-primary">
            --{token.name}
          </div>
        </Field>

        <Field label="Type">
          <div className="rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 text-xs text-vs-text-secondary">
            {TYPE_LABEL[token.type]}
          </div>
        </Field>

        <Field label="Value">
          <div className="flex items-center gap-2">
            {isColor && (
              <input
                type="color"
                value={colorHex}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-vs-border-default bg-vs-bg-elevated p-0.5"
              />
            )}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1 rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 font-mono text-xs text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
            />
          </div>
        </Field>

        {/* live preview */}
        <div className="flex items-center gap-3 rounded-lg border border-vs-border-default bg-vs-bg-primary p-3">
          <Preview token={{ ...token, resolvedValue: value }} large />
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-vs-text-primary">--{token.name}</div>
            <div className="font-mono text-[11px] text-vs-text-secondary">{value}</div>
          </div>
        </div>

        {/* source */}
        <div className="flex items-center gap-2 border-t border-vs-border-default pt-4">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: src.dot }} />
          <span className="text-xs text-vs-text-secondary">{src.line}</span>
        </div>

        {/* figma reconciliation */}
        {token.figmaValue !== undefined && (
          <div className="flex flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-primary p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
                Figma variable
              </span>
              {token.drift === "drifted" ? (
                <span className="rounded-full border border-vs-warning-border bg-vs-warning-muted px-1.5 py-0.5 text-[10px] font-medium text-vs-warning">
                  drifted
                </span>
              ) : (
                <span className="text-[10px] text-vs-success">in sync</span>
              )}
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-vs-text-muted">Figma</span>
              <span className="text-vs-text-primary">{token.figmaValue}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-vs-text-muted">Code</span>
              <span className={token.drift === "drifted" ? "text-vs-warning" : "text-vs-text-primary"}>
                {token.resolvedValue}
              </span>
            </div>
            {token.drift === "drifted" && (
              <button
                onClick={() => setValue(token.figmaValue ?? value)}
                className="mt-0.5 self-start rounded-md border border-vs-border-strong px-2.5 py-1 text-[11px] text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary"
              >
                Use Figma value
              </button>
            )}
          </div>
        )}

        {/* where used */}
        <div className="flex flex-col gap-2 border-t border-vs-border-default pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Where used <span className="text-vs-border-strong">· {token.uses}</span>
          </span>
          {usage.length === 0 ? (
            <span className="px-2 py-1.5 text-xs text-vs-text-muted">Not referenced yet</span>
          ) : (
            usage.map((u, i) => (
              <div
                key={`${u.component}-${i}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-vs-bg-elevated"
              >
                <span className="text-xs text-vs-text-primary">{u.component}</span>
                {u.property && (
                  <span className="font-mono text-[11px] text-vs-text-secondary">{u.property}</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* refactor — routed through a gated Claude Code run (token file + code) */}
        <div className="flex flex-col gap-2.5 border-t border-vs-border-default pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Refactor <span className="text-vs-border-strong">· via Claude Code</span>
          </span>
          {renaming ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-vs-text-muted">--</span>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value.replace(/[^\w-]/g, ""))}
                className="flex-1 rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-1.5 font-mono text-xs text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              />
              <button
                disabled={busy || !newName.trim() || newName.trim() === token.name}
                onClick={() => onRename(token.name, newName)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  busy || !newName.trim() || newName.trim() === token.name
                    ? "cursor-not-allowed bg-vs-bg-elevated text-vs-text-muted"
                    : "bg-vs-accent text-white hover:brightness-110"
                }`}
              >
                Rename
              </button>
              <button
                onClick={() => {
                  setRenaming(false);
                  setNewName(token.name);
                }}
                className="rounded-md px-2 py-1.5 text-xs text-vs-text-muted hover:text-vs-text-primary"
              >
                Cancel
              </button>
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] text-vs-text-secondary">
                Re-point {token.uses} {token.uses === 1 ? "use" : "uses"} and remove the
                declaration?
              </span>
              <button
                disabled={busy}
                onClick={() => onDelete(token.name)}
                className="rounded-md bg-vs-error px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-2 py-1.5 text-xs text-vs-text-muted hover:text-vs-text-primary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                disabled={busy}
                onClick={() => setRenaming(true)}
                className="rounded-md border border-vs-border-default px-3 py-1.5 text-xs text-vs-text-secondary hover:border-vs-border-strong hover:text-vs-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Rename…
              </button>
              <button
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="rounded-md border border-vs-border-default px-3 py-1.5 text-xs text-vs-text-secondary hover:border-vs-error hover:text-vs-error disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
              <span className="flex-1 text-right text-[11px] text-vs-text-muted">
                gated · revertable
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-vs-border-default px-4 py-3.5">
        <span className="flex-1 text-[11px] text-vs-text-muted">
          {dirty ? "Value edits are written to the token file" : `Saved to ${tokenFile ?? "token file"}`}
        </span>
        <button
          disabled={!dirty || saving}
          onClick={() => void save()}
          className={`rounded-lg px-4 py-2 text-xs font-medium ${
            dirty && !saving
              ? "bg-vs-accent text-white hover:brightness-110"
              : "cursor-not-allowed bg-vs-bg-elevated text-vs-text-muted"
          }`}
        >
          {saving ? "Saving…" : "Save value"}
        </button>
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-vs-text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Type preview: swatch for colors, "Ag" for type, bar for spacing, corner for radius, box for shadow. */
function Preview({ token, large }: { token: InspectorToken; large?: boolean }): React.JSX.Element {
  const size = large ? "h-9 w-9" : "h-5 w-5";
  const v = token.resolvedValue;
  if (token.type === "color") {
    return (
      <span
        className={`${size} shrink-0 rounded-md border border-vs-border-strong`}
        style={{ background: isCssColor(v) ? v : "transparent" }}
      />
    );
  }
  const inner =
    token.type === "typography" ? (
      <span className="text-[10px] text-vs-text-primary">Ag</span>
    ) : token.type === "spacing" ? (
      <span className="h-0.5 w-2.5 rounded-sm bg-vs-text-secondary" />
    ) : token.type === "radius" ? (
      <span className="h-2.5 w-2.5 rounded-tl border-l-2 border-t-2 border-vs-text-secondary" />
    ) : token.type === "shadow" ? (
      <span className="h-2.5 w-2.5 rounded bg-vs-border-strong shadow" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-vs-text-muted" />
    );
  return (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-md border border-vs-border-strong bg-vs-bg-elevated`}
    >
      {inner}
    </span>
  );
}

function isCssColor(v: string): boolean {
  return /^#|^(rgb|rgba|hsl|hsla|oklch)\(|^(white|black|transparent|currentcolor)$/i.test(v.trim());
}
