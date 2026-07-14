import { useEffect, useMemo, useState } from "react";
import type {
  EnvCheck,
  FigmaCollection,
  FigmaConnection,
  FigmaVariable,
  FileSnapshot,
  InspectorToken,
  Project,
  PushPlan,
  TokenSource,
  TokenType,
  TokenUsage,
} from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { useAgentRun } from "../lib/useAgentRun";
import { Spinner } from "@vortspec/ui/ui";
import { RunPanel } from "@vortspec/ui/RunPanel";
import { ProjectRail, projectRailItems } from "@vortspec/ui/ProjectRail";

/** Export Figma variables to a cache file so the cockpit can reconcile locally. Read-only w.r.t. code. */
const FIGMA_SYNC_PROMPT = [
  "Export this design system's Figma variables so VortSpec can reconcile them with the token file.",
  "",
  "1. Using the connected Figma MCP (Desktop Bridge), fetch ALL variable collections and their variables.",
  "   For EACH variable capture its value in EVERY mode of its collection (not just the default mode).",
  "2. Write the result to `.vortspec/figma-variables.json` as a single JSON OBJECT with this shape:",
  "   {",
  '     "collections": [ { "name": "<collection>", "modes": [ { "id": "<modeId>", "name": "<mode>" } ],',
  '                        "defaultModeId": "<modeId>" } ],',
  '     "variables": [ {',
  '       "name": "<full slash path, e.g. primitive/color/primary>",',
  '       "collection": "<collection name>",',
  '       "resolvedType": "COLOR|FLOAT|STRING|BOOLEAN",',
  '       "resolvedValue": "<default mode concrete value>",',
  '       "valuesByMode": { "<mode name>": { "value": "<concrete value>", "aliasOf": "<target slash path, if this mode is an alias>" } }',
  "     } ]",
  "   }",
  "   Keep the FULL slash path in `name` (do not flatten `/` to `-`). Resolve each value to a CONCRETE value",
  "   (hex for colors, px/number for dimensions); when a mode's value is an alias, ALSO record `aliasOf`.",
  "3. Write ONLY `.vortspec/figma-variables.json`. Do not modify the token file, component sources, or",
  "   any other file, and do not change anything in Figma.",
].join("\n");

/**
 * Code→Figma push (MCP fallback). When figma-cli isn't connected, a scoped Claude
 * Code run applies the confirmed plan to the user's Figma via their own MCP, using
 * bulk variable ops. VortSpec never writes Figma directly. The plan is embedded so
 * the run has an exact, pre-confirmed instruction — it does not recompute a diff.
 */
function pushPrompt(plan: PushPlan): string {
  const creates = plan.entries.filter((e) => e.op === "create");
  const updates = plan.entries.filter((e) => e.op === "update");
  const modeLine = plan.mode
    ? ` Write values into the "${plan.mode}" mode (leave other modes untouched).`
    : "";
  return [
    `Apply this pre-approved token push to the Figma Variables, following the file's layered token architecture.${modeLine}`,
    "",
    "Routing — place each variable by its `layer`, beside where its siblings already live:",
    "  • `primitive` → the Primitive color/number collection (raw values).",
    "  • `semantic`  → the Semantic collection; when an entry has an `aliasTarget`, bind it as an ALIAS",
    "     to that variable EVEN IF the target lives in another collection (cross-collection aliases are fine).",
    "  • `component` → a Component collection; alias to the semantic it references.",
    "  If no matching collection exists yet, create one named `<Layer> / <Family>` (e.g. `Semantic / Color`).",
    "  Never MOVE an existing variable — update it in place in whatever collection already holds it.",
    "1. Create the following NEW variables (figma_batch_create_variables). Keep the FULL slash path in the",
    "   name so Figma folders it (e.g. `primitive/red/500`). For entries with an `aliasTarget`, bind an alias",
    plan.mode ? `   in the "${plan.mode}" mode instead of a raw value:` : "   instead of a raw value:",
    `   ${JSON.stringify(creates)}`,
    "2. Update these EXISTING variables to the given value/alias (figma_batch_update_variables)" +
      (plan.mode ? ` in the "${plan.mode}" mode:` : ":"),
    `   ${JSON.stringify(updates)}`,
    "3. Do not delete variables, restyle layers, or touch any local file. Report how many you created and updated.",
  ].join("\n");
}

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

/** A token's displayed values for the active mode (change: figma-native-token-model). */
type ModeView = {
  resolvedValue: string;
  rawValue: string;
  figmaValue?: string;
  drift?: InspectorToken["drift"];
  readOnly: boolean;
};

/** The values to show/edit for a token in the active mode — falls back to the flat default. */
function modeView(token: InspectorToken, mode: string | null): ModeView {
  const m = mode && token.modes ? token.modes[mode] : undefined;
  if (m) {
    return {
      resolvedValue: m.resolvedValue,
      rawValue: m.rawValue,
      figmaValue: m.figmaValue,
      drift: m.drift,
      readOnly: m.readOnly,
    };
  }
  return {
    resolvedValue: token.resolvedValue,
    rawValue: token.rawValue,
    figmaValue: token.figmaValue,
    drift: token.drift,
    readOnly: false,
  };
}

/** One rendered row of the group-folder tree: a collapsible folder header or a leaf token. */
type TreeRow =
  | { kind: "folder"; depth: number; label: string; key: string; count: number }
  | { kind: "token"; depth: number; token: InspectorToken };

/**
 * Design System Inspector — Tokens page (design: "Tokens.dc.html", adapted to
 * v2). Left rail + grouped token table + a detail drawer that opens on selection
 * with the token's value editor (gated, written to the token file), source line,
 * and where-used listing. All file-derived; no IR store.
 */
export function Inspector({
  project,
  hideRail = false,
  onBack,
  onOpenPreview,
  onOpenRun,
  onOpenHistory,
  onOpenManifest,
  onOpenFile,
}: {
  project: Project;
  /** Hide the internal ProjectRail (the IDE supplies its own activity-bar navigation). */
  hideRail?: boolean;
  onBack: () => void;
  onOpenPreview: () => void;
  onOpenRun: () => void;
  onOpenHistory: () => void;
  onOpenManifest: () => void;
  /** Open a workspace file in the editor (IDE). When absent, the file is revealed
   *  in the OS file manager instead — lets a token's "where used" jump to source. */
  onOpenFile?: (relPath: string) => void;
}): React.JSX.Element {
  const [tokens, setTokens] = useState<InspectorToken[] | null>(null);
  const [usage, setUsage] = useState<Record<string, TokenUsage[]>>({});
  // Map a where-used component (its file basename, as `buildUsage` records it) to
  // its source path, so a "where used" row can jump to the component.
  const [componentFile, setComponentFile] = useState<Record<string, string>>({});
  const [tokenFile, setTokenFile] = useState<string | null>(null);
  const [segment, setSegment] = useState<TokenType | "all">("all");
  const [query, setQuery] = useState("");
  const [codeOnly, setCodeOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [figmaOnly, setFigmaOnly] = useState<FigmaVariable[]>([]);
  const [figmaSynced, setFigmaSynced] = useState(false);
  const [figmaEnv, setFigmaEnv] = useState<EnvCheck | null>(null);
  // figma-cli is the PRIMARY reader; the Figma MCP (figmaEnv) is the fallback.
  const [figmaCli, setFigmaCli] = useState<FigmaConnection | null>(null);
  const [cliSyncing, setCliSyncing] = useState(false);
  // True only while a *slow* (cold) auto-connect is in flight, so the warm path
  // (already connected → resolves in ms) doesn't flash a "reconnecting" hint.
  const [connecting, setConnecting] = useState(false);

  // Gated rename/delete via a scoped Claude Code run (touches the token file +
  // component sources); snapshotted before the run so it can be reverted.
  const tokenMod = useAgentRun();
  const [snapshot, setSnapshot] = useState<FileSnapshot[] | null>(null);
  const [modReview, setModReview] = useState(false);
  const [modLabel, setModLabel] = useState("");

  // Figma sync: a scoped Claude Code run exports variables → the cockpit
  // reconciles locally on the next read. VortSpec never talks to Figma directly.
  const figmaSync = useAgentRun();

  // Code→Figma push: plan is computed locally + previewed; the confirmed plan is
  // applied by figma-cli (preferred) or a scoped Claude Code run (MCP fallback).
  const pushRun = useAgentRun();
  const [pushPlan, setPushPlan] = useState<PushPlan | null>(null);
  const [pushing, setPushing] = useState(false);
  // New-token creation form.
  const [creating, setCreating] = useState(false);
  const [newTok, setNewTok] = useState<{ name: string; value: string; type: TokenType }>({
    name: "",
    value: "",
    type: "color",
  });

  // Figma-native model (change: figma-native-token-model): collections + modes +
  // the mode↔context map, plus the collection/mode the user is currently viewing.
  const [collections, setCollections] = useState<FigmaCollection[]>([]);
  const [modeMap, setModeMap] = useState<Record<string, string>>({});
  const [pickedCollection, setPickedCollection] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<string | null>(null);
  // Group folders collapsed in the tree (by their slash-path key).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modeMapOpen, setModeMapOpen] = useState(false);

  async function reloadTokens(preferredCollection?: string): Promise<void> {
    const r = await api.inspectorTokens(project.path, preferredCollection);
    setTokens(r.tokens);
    setUsage(r.usage);
    setTokenFile(r.tokenFile);
    setFigmaOnly(r.figmaOnly);
    setFigmaSynced(r.figmaSynced);
    setCollections(r.collections);
    setModeMap(r.modeMap);
    setPickedCollection(r.activeCollection);
    setActiveMode(r.activeMode);
  }

  useEffect(() => {
    let alive = true;
    void reloadTokens();
    void api.verifyFigmaMcp().then(setFigmaEnv);
    // ensureConnected auto-connects if needed (single-flight with the on-open
    // warm-up) so the sync/push buttons reflect a live connection without a
    // manual connect; falls back to plain status shape when not installed.
    // Show the "reconnecting" hint only if the connect is still pending after a
    // beat — the already-connected path resolves too fast to be worth flashing.
    const slow = setTimeout(() => alive && setConnecting(true), 500);
    void api
      .figmaEnsureConnected()
      .then((c) => {
        if (!alive) return;
        setFigmaCli(c);
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(slow);
        if (alive) setConnecting(false);
      });
    // Build the component → file map for "where used" navigation.
    void api.inspectorComponents(project.path).then((r) => {
      const map: Record<string, string> = {};
      for (const c of r.components) {
        if (!c.file) continue;
        const base = c.file.split("/").pop() ?? c.file;
        // Key by both the file basename-sans-extension and the component name,
        // since usage is recorded under the file's basename.
        map[base.replace(/\.[^.]+$/, "")] = c.file;
        map[c.name] = c.file;
      }
      setComponentFile(map);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  /** Jump to a component's source from a token's "where used" list. */
  function openComponent(component: string): void {
    const rel = componentFile[component];
    if (!rel) return;
    if (onOpenFile) onOpenFile(rel);
    else void api.revealPath(project.path, rel);
  }

  // Step 1's primary reader: figma-cli (fast, no token). When it isn't
  // connected, fall back to the scoped-Claude MCP export. VortSpec always
  // prefers the CLI but keeps the MCP path so users can still sync.
  async function syncFigma(): Promise<void> {
    if (figmaCli?.connected) {
      setCliSyncing(true);
      try {
        const r = await api.figmaSyncVariables(project.path);
        if (r.ok) {
          await reloadTokens();
          flash(r.message);
          return;
        }
        // CLI ran but couldn't export — surface why rather than silently
        // spending Claude usage on the fallback.
        flash(r.message);
        return;
      } finally {
        setCliSyncing(false);
      }
    }
    // Fallback: the Figma MCP via a scoped Claude Code run.
    if (figmaEnv?.status === "pass") {
      await figmaSync.start({ prompt: FIGMA_SYNC_PROMPT, cwd: project.path, bypassPermissions: true });
      return;
    }
    flash("Connect figma-cli (preferred) or the Figma MCP to sync variables.");
  }
  // When the MCP export run finishes, re-read tokens (now reconciled against Figma).
  useEffect(() => {
    if (figmaSync.model.status !== "done") return;
    void reloadTokens().then(() => flash("Reconciled with Figma variables"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figmaSync.model.status]);

  // ── Code → Figma push ──────────────────────────────────────────────
  // Compute the plan locally (never calls Figma) and open the confirm gate.
  async function startPush(): Promise<void> {
    if (!figmaConnected) {
      flash("Connect figma-cli (preferred) or the Figma MCP to push tokens to Figma.");
      return;
    }
    const plan = await api.figmaComputePushPlan(project.path);
    if (plan.entries.length === 0) {
      flash("Figma is already in sync — nothing to push.");
      return;
    }
    setPushPlan(plan);
  }
  // Apply the confirmed plan: figma-cli when connected, else the MCP fallback run.
  async function confirmPush(): Promise<void> {
    if (!pushPlan) return;
    if (cliConnected) {
      setPushing(true);
      try {
        const r = await api.figmaPushVariables(project.path, pushPlan);
        setPushPlan(null);
        if (r.ok) {
          await api.figmaSyncVariables(project.path).catch(() => undefined); // refresh cache
          await reloadTokens();
        }
        flash(r.message);
      } finally {
        setPushing(false);
      }
      return;
    }
    // MCP fallback: hand the confirmed plan to a scoped Claude Code run.
    const plan = pushPlan;
    setPushPlan(null);
    await pushRun.start({ prompt: pushPrompt(plan), cwd: project.path, bypassPermissions: true });
  }
  // After the MCP push run, refresh the cache + tokens so drift clears.
  useEffect(() => {
    if (pushRun.model.status !== "done") return;
    void api
      .figmaSyncVariables(project.path)
      .catch(() => undefined)
      .then(() => reloadTokens())
      .then(() => flash("Pushed to Figma — reconciled"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushRun.model.status]);

  async function submitNewToken(): Promise<void> {
    try {
      const r = await api.createToken(project.path, newTok.name, newTok.value);
      setTokens(r.tokens);
      setUsage(r.usage);
      setCreating(false);
      setNewTok({ name: "", value: "", type: "color" });
      flash(`Created --${newTok.name.trim().replace(/^--/, "")}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't create the token.");
    }
  }

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

  const filtered = useMemo(() => {
    if (!tokens) return [];
    const q = query.trim().toLowerCase();
    return tokens.filter(
      (t) =>
        (segment === "all" || t.type === segment) &&
        (!codeOnly || t.source === "generated-code") &&
        (q === "" ||
          t.name.toLowerCase().includes(q) ||
          modeView(t, activeMode).resolvedValue.toLowerCase().includes(q)),
    );
  }, [tokens, query, segment, codeOnly, activeMode]);

  // Type grouping (the fallback when no Figma group paths are present).
  const groups = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({ type, items: filtered.filter((t) => t.type === type) })).filter(
        (g) => g.items.length > 0,
      ),
    [filtered],
  );

  // Figma-native folder tree: nest tokens under their `/` group path with
  // indentation, mirroring how Figma displays variables (change:
  // figma-native-token-model). Used whenever any token carries a group path.
  const useTree = useMemo(() => filtered.some((t) => (t.group?.length ?? 0) > 0), [filtered]);
  const treeRows = useMemo<TreeRow[]>(() => {
    if (!useTree) return [];
    const counts = new Map<string, number>();
    for (const t of filtered) {
      const g = t.group ?? [];
      for (let d = 0; d < g.length; d++) {
        const key = g.slice(0, d + 1).join("/");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const sorted = [...filtered].sort((a, b) =>
      [...(a.group ?? []), a.name].join("/").localeCompare([...(b.group ?? []), b.name].join("/")),
    );
    const rows: TreeRow[] = [];
    let prev: string[] = [];
    for (const t of sorted) {
      const segs = t.group ?? [];
      let common = 0;
      while (common < segs.length && common < prev.length && segs[common] === prev[common]) common++;
      for (let d = common; d < segs.length; d++) {
        const key = segs.slice(0, d + 1).join("/");
        rows.push({ kind: "folder", depth: d, label: segs[d], key, count: counts.get(key) ?? 0 });
      }
      rows.push({ kind: "token", depth: segs.length, token: t });
      prev = segs;
    }
    // Hide anything strictly under a collapsed folder (the folder header stays).
    return rows.filter((r) => {
      const path = r.kind === "folder" ? r.key : [...(r.token.group ?? []), r.token.name].join("/");
      for (const c of collapsed) if (path !== c && path.startsWith(c + "/")) return false;
      return true;
    });
  }, [filtered, useTree, collapsed]);

  const activeCollectionObj =
    collections.find((c) => c.name === pickedCollection) ?? collections[0] ?? null;
  const modes = activeCollectionObj?.modes ?? [];
  const multiMode = modes.length > 1;

  const total = tokens?.length ?? 0;
  const resultCount = filtered.length;
  const selectedToken = tokens?.find((t) => t.name === selected) ?? null;
  const driftCount = tokens?.filter((t) => modeView(t, activeMode).drift === "drifted").length ?? 0;
  const inSyncCount = tokens?.filter((t) => modeView(t, activeMode).drift === "in-sync").length ?? 0;
  const cliConnected = figmaCli?.connected ?? false;
  const mcpConnected = figmaEnv?.status === "pass";
  // The sync button lights up when EITHER path can run; the CLI is preferred.
  const figmaConnected = cliConnected || mcpConnected;
  const syncSource: "cli" | "mcp" | null = cliConnected ? "cli" : mcpConnected ? "mcp" : null;

  async function saveValue(name: string, value: string): Promise<void> {
    // Route a per-mode edit into that mode's code context; default mode → no context.
    const context = activeMode ? modeMap[activeMode] : undefined;
    const r = await api.setTokenValue(project.path, name, value, context || undefined);
    setTokens(r.tokens);
    setUsage(r.usage);
    const where = activeMode && multiMode ? ` (${activeMode})` : "";
    flash(`Saved --${name}${where} to ${tokenFile ?? "token file"}`);
  }

  /** Switch the collection in view — re-reconciles server-side against that collection. */
  async function selectCollection(name: string): Promise<void> {
    setPickedCollection(name);
    setCollapsed(new Set());
    await reloadTokens(name);
  }

  async function saveModeMap(next: Record<string, string>): Promise<void> {
    const r = await api.setTokenModeMap(project.path, next);
    setModeMap(r.modeMap);
    setTokens(r.tokens);
    flash("Updated the mode → context map");
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      {!hideRail && (
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
      )}

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
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg border border-vs-border-strong bg-vs-bg-surface px-3 py-1.5 text-xs text-vs-text-secondary hover:border-vs-border-strong hover:text-vs-text-primary"
            >
              + New token
            </button>
            <button
              onClick={() => void startPush()}
              disabled={!figmaConnected || pushing || pushRun.running}
              title={figmaConnected ? "Push code token changes to the Figma Variables collection" : "Connect figma-cli or the Figma MCP to push tokens to Figma"}
              className="rounded-lg border border-vs-accent bg-vs-bg-elevated px-3 py-1.5 text-xs font-medium text-vs-text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pushing || pushRun.running ? "Sending…" : "Send to Figma"}
            </button>
            {connecting ? (
              <span
                title="Connecting figma-cli to Figma Desktop…"
                className="flex items-center gap-1.5 rounded-full border border-vs-border-default bg-vs-bg-surface px-3 py-1 text-xs text-vs-text-secondary"
              >
                <Spinner />
                Reconnecting to Figma…
              </span>
            ) : (
              <FigmaSyncButton
                connected={figmaConnected}
                source={syncSource}
                running={figmaSync.running || cliSyncing}
                synced={figmaSynced}
                onSync={() => void syncFigma()}
                onConnect={() => figmaEnv?.fix?.url && void api.openInstall(figmaEnv.fix.url)}
              />
            )}
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
            {/* Collection scope — shown only when Figma exposes more than one. */}
            {collections.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs text-vs-text-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-sm bg-vs-accent" />
                <select
                  value={activeCollectionObj?.name ?? ""}
                  onChange={(e) => void selectCollection(e.target.value)}
                  className="rounded-md border border-vs-border-default bg-vs-bg-surface px-2 py-1.5 text-xs text-vs-text-primary focus:outline-none"
                  title="Figma variable collection"
                >
                  {collections.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* Mode switcher — swaps every value/drift to the chosen mode. */}
            {multiMode && (
              <div className="flex items-center gap-0.5 rounded-lg border border-vs-border-default bg-vs-bg-surface p-0.5">
                {modes.map((m) => {
                  const mapped = modeMap[m.name];
                  return (
                    <Segment
                      key={m.id}
                      active={activeMode === m.name}
                      onClick={() => setActiveMode(m.name)}
                    >
                      <span title={mapped ? `→ ${mapped}` : "No mapped code context (read-only)"}>
                        {m.name}
                        {!mapped && <span className="ml-1 text-vs-text-muted">·ro</span>}
                      </span>
                    </Segment>
                  );
                })}
                <button
                  onClick={() => setModeMapOpen(true)}
                  title="Edit the mode → code-context map"
                  className="rounded px-1.5 text-xs text-vs-text-muted hover:text-vs-text-primary"
                >
                  ⚙
                </button>
              </div>
            )}
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
          ) : useTree ? (
            // Figma-native group-folder tree with indentation + collapse.
            treeRows.map((r) =>
              r.kind === "folder" ? (
                <button
                  key={`f:${r.key}`}
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.key)) next.delete(r.key);
                      else next.add(r.key);
                      return next;
                    })
                  }
                  style={{ paddingLeft: 22 + r.depth * 16 }}
                  className="flex w-full items-center gap-2 border-b border-vs-border-default bg-vs-bg-surface/40 py-1.5 pr-5 text-left hover:bg-vs-bg-hover"
                >
                  <span className="w-3 text-[10px] text-vs-text-muted">
                    {collapsed.has(r.key) ? "▸" : "▾"}
                  </span>
                  <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-vs-text-secondary">
                    {r.label}
                  </span>
                  <span className="font-mono text-[10px] text-vs-text-muted">{r.count}</span>
                </button>
              ) : (
                <TokenRow
                  key={r.token.name}
                  token={r.token}
                  view={modeView(r.token, activeMode)}
                  depth={r.depth}
                  selected={r.token.name === selected}
                  figmaSynced={figmaSynced}
                  onSelect={() => setSelected(r.token.name)}
                  onCopy={(text, what) => {
                    void navigator.clipboard?.writeText(text);
                    flash(`Copied ${what}`);
                  }}
                />
              ),
            )
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
                    view={modeView(t, activeMode)}
                    selected={t.name === selected}
                    figmaSynced={figmaSynced}
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

      {modeMapOpen && (
        <ModeMapModal
          modes={modes}
          contexts={Array.from(
            new Set([":root", ".dark", '[data-theme="dark"]', "@media (prefers-color-scheme: dark)", ...Object.values(modeMap)]),
          ).filter(Boolean)}
          map={modeMap}
          onClose={() => setModeMapOpen(false)}
          onSave={(next) => {
            void saveModeMap(next);
            setModeMapOpen(false);
          }}
        />
      )}

      {/* Detail drawer */}
      {selectedToken && (
        <TokenDrawer
          key={selectedToken.name}
          token={selectedToken}
          view={modeView(selectedToken, activeMode)}
          modeLabel={multiMode ? activeMode : null}
          usage={usage[selectedToken.name] ?? []}
          tokenFile={tokenFile}
          busy={tokenMod.running}
          onClose={() => setSelected(null)}
          onSave={saveValue}
          onRename={requestRename}
          onDelete={requestDelete}
          canOpen={(component) => Boolean(componentFile[component])}
          onOpenComponent={openComponent}
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

      {/* Code → Figma push — preview + confirm gate (nothing is written until confirmed) */}
      {pushPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex max-h-[80vh] w-[600px] flex-col gap-3 rounded-xl border border-vs-border-strong bg-vs-bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-vs-text-primary">Send to Figma</span>
              <span className="font-mono text-[11px] text-vs-text-muted">
                {cliConnected ? "figma-cli" : "Claude Code · Figma MCP"}
                {pushPlan.mode ? ` · ${pushPlan.mode} mode` : ""}
              </span>
            </div>
            <p className="text-[11px] text-vs-text-muted">
              {pushPlan.entries.filter((e) => e.op === "create").length} to create ·{" "}
              {pushPlan.entries.filter((e) => e.op === "update").length} to update. Each variable is routed
              to the collection its siblings live in (primitive · semantic · component); semantics alias
              their primitives. Nothing is written until you confirm.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-vs-border-default">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="sticky top-0 bg-vs-bg-elevated text-vs-text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-normal">Op</th>
                    <th className="px-2 py-1.5 font-normal">Layer</th>
                    <th className="px-2 py-1.5 font-normal">Variable</th>
                    <th className="px-2 py-1.5 font-normal">New value</th>
                    <th className="px-2 py-1.5 font-normal">Current in Figma</th>
                  </tr>
                </thead>
                <tbody>
                  {pushPlan.entries.map((e) => (
                    <tr key={e.variable} className="border-t border-vs-border-default">
                      <td className="px-2 py-1.5">
                        <span className={e.op === "create" ? "text-vs-success" : "text-vs-warning"}>
                          {e.op}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-vs-text-muted">{e.layer}</td>
                      <td className="px-2 py-1.5 text-vs-text-primary">{e.variable}</td>
                      <td className="px-2 py-1.5 text-vs-text-secondary">
                        {e.aliasTarget ? `→ alias ${e.aliasTarget}` : e.value}
                      </td>
                      <td className="px-2 py-1.5 text-vs-text-muted">{e.currentFigmaValue ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-vs-border-default pt-3">
              <button
                onClick={() => setPushPlan(null)}
                className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmPush()}
                disabled={pushing}
                className="rounded-lg bg-vs-accent px-4 py-2 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
              >
                {pushing ? "Sending…" : `Push ${pushPlan.entries.length} to Figma`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MCP-fallback push run — progress only */}
      {(pushRun.running || pushRun.model.status === "error") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex max-h-[80vh] w-[560px] flex-col gap-3 rounded-xl border border-vs-border-strong bg-vs-bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-vs-text-primary">Pushing tokens to Figma</span>
              <span className="font-mono text-[11px] text-vs-text-muted">Claude Code · Figma MCP</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RunPanel model={pushRun.model} />
            </div>
            <div className="flex items-center justify-end border-t border-vs-border-default pt-3">
              {pushRun.running ? (
                <button
                  onClick={() => void pushRun.cancel()}
                  className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:border-vs-error hover:text-vs-error"
                >
                  Cancel push
                </button>
              ) : (
                <button
                  onClick={() => pushRun.reset()}
                  className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New token form */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex w-[420px] flex-col gap-3 rounded-xl border border-vs-border-strong bg-vs-bg-surface p-4 shadow-2xl">
            <span className="text-sm font-semibold text-vs-text-primary">New token</span>
            <label className="flex flex-col gap-1 text-[11px] text-vs-text-muted">
              Name
              <div className="flex items-center rounded-md border border-vs-border-default bg-vs-bg-surface px-2.5 focus-within:ring-2 focus-within:ring-vs-accent-subtle">
                <span className="font-mono text-xs text-vs-text-muted">--</span>
                <input
                  autoFocus
                  value={newTok.name}
                  onChange={(e) => setNewTok((s) => ({ ...s, name: e.target.value }))}
                  placeholder="color-brand"
                  className="flex-1 bg-transparent py-1.5 pl-1 font-mono text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-vs-text-muted">
              Value
              <input
                value={newTok.value}
                onChange={(e) => setNewTok((s) => ({ ...s, value: e.target.value }))}
                placeholder="#7C6FF0"
                className="rounded-md border border-vs-border-default bg-vs-bg-surface px-2.5 py-1.5 font-mono text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-vs-text-muted">
              Type
              <select
                value={newTok.type}
                onChange={(e) => setNewTok((s) => ({ ...s, type: e.target.value as TokenType }))}
                className="rounded-md border border-vs-border-default bg-vs-bg-surface px-2.5 py-1.5 text-xs text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              >
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-end gap-3 border-t border-vs-border-default pt-3">
              <button
                onClick={() => {
                  setCreating(false);
                  setNewTok({ name: "", value: "", type: "color" });
                }}
                className="rounded-lg border border-vs-border-strong px-3.5 py-2 text-xs text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitNewToken()}
                disabled={!newTok.name.trim() || !newTok.value.trim()}
                className="rounded-lg bg-vs-accent px-4 py-2 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
              >
                Create token
              </button>
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
  source,
  running,
  synced,
  onSync,
  onConnect,
}: {
  connected: boolean;
  /** which path will run: figma-cli (preferred), the Figma MCP, or neither. */
  source: "cli" | "mcp" | null;
  running: boolean;
  synced: boolean;
  onSync: () => void;
  onConnect: () => void;
}): React.JSX.Element {
  if (!connected) {
    return (
      <button
        onClick={onConnect}
        title="No Figma connection. Preferred: set up figma-cli (fast, no token). Alternative: connect the Figma MCP / Desktop Bridge."
        className="flex items-center gap-1.5 rounded-full border border-vs-border-default bg-vs-bg-surface px-3 py-1 text-xs text-vs-text-muted hover:border-vs-border-strong hover:text-vs-text-secondary"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-text-muted" />
        Connect Figma to reconcile
      </button>
    );
  }
  const via = source === "cli" ? "figma-cli" : "Figma MCP";
  return (
    <button
      onClick={onSync}
      disabled={running}
      title={
        source === "cli"
          ? "Reading variables directly through figma-cli (preferred — fast, no token)."
          : "figma-cli isn't connected — syncing through the Figma MCP instead."
      }
      className="flex items-center gap-1.5 rounded-full border border-vs-accent bg-vs-bg-elevated px-3 py-1 text-xs text-vs-text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-success" />
      {running ? "Syncing…" : synced ? "Re-sync from Figma" : "Sync from Figma"}
      <span className="text-[10px] text-vs-text-muted">· {via}</span>
    </button>
  );
}

/**
 * Transparent-cockpit editor for the Figma-mode → code-context map (change:
 * figma-native-token-model). A wrong default is a one-click fix; an unmapped mode
 * is read-only, never silently mis-synced.
 */
function ModeMapModal({
  modes,
  contexts,
  map,
  onClose,
  onSave,
}: {
  modes: { id: string; name: string }[];
  contexts: string[];
  map: Record<string, string>;
  onClose: () => void;
  onSave: (next: Record<string, string>) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...map }));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-vs-border-strong bg-vs-bg-elevated p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm font-semibold text-vs-text-primary">Mode → code context</h3>
        <p className="mb-4 text-xs text-vs-text-muted">
          Map each Figma mode to the selector that carries its values in the token file. Leave a mode
          unmapped to keep it read-only — VortSpec never invents a context that doesn’t exist.
        </p>
        <div className="space-y-2">
          {modes.map((m) => (
            <label key={m.id} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate font-mono text-xs text-vs-text-secondary">
                {m.name}
              </span>
              <select
                value={draft[m.name] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [m.name]: e.target.value }))}
                className="flex-1 rounded-md border border-vs-border-default bg-vs-bg-surface px-2 py-1.5 text-xs text-vs-text-primary focus:outline-none"
              >
                <option value="">— unmapped (read-only) —</option>
                {contexts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-vs-border-default px-3 py-1.5 text-xs text-vs-text-secondary hover:bg-vs-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-md border border-vs-accent bg-vs-bg-elevated px-3 py-1.5 text-xs text-vs-text-primary hover:brightness-110"
          >
            Save map
          </button>
        </div>
      </div>
    </div>
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
  view,
  depth = 0,
  selected,
  figmaSynced,
  onSelect,
  onCopy,
}: {
  token: InspectorToken;
  /** The active-mode values to display (falls back to the flat default). */
  view: ModeView;
  /** Group-folder nesting depth, for indentation in the tree view. */
  depth?: number;
  selected: boolean;
  /** whether a Figma export has been reconciled (so "code-only" means "pushable, not yet in Figma"). */
  figmaSynced: boolean;
  onSelect: () => void;
  onCopy: (text: string, what: string) => void;
}): React.JSX.Element {
  const [menu, setMenu] = useState(false);
  const src = SOURCE[token.source];
  // Leaf label = final path segment when nested; else the flat name.
  const label = depth > 0 ? token.name.split(/[-/]/).slice(-1)[0] : token.name;
  // Pushable: drifted (value differs) or code-only once a Figma sync exists (would be created on push).
  const pushableNew = figmaSynced && !view.drift && token.source !== "figma-variable" && !view.readOnly;
  return (
    <div
      onClick={onSelect}
      style={{
        ...(selected ? { boxShadow: "inset 2px 0 0 #7C6FF0" } : undefined),
        paddingLeft: 22 + depth * 16,
      }}
      className={`relative flex h-11 cursor-pointer items-center gap-3 border-b border-vs-border-default pr-5 ${
        selected ? "bg-vs-bg-elevated" : "hover:bg-vs-bg-hover"
      }`}
    >
      <Preview token={{ ...token, resolvedValue: view.resolvedValue }} />
      <span
        title={token.name}
        className="w-[210px] shrink-0 truncate font-mono text-xs text-vs-text-primary"
      >
        {label}
      </span>
      <span className="w-40 shrink-0 truncate font-mono text-xs text-vs-text-secondary">
        {view.resolvedValue}
      </span>
      <span className="flex w-24 shrink-0 items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: src.dot }} />
        <span className="text-xs text-vs-text-secondary">{src.label}</span>
      </span>
      <span className="flex-1" />
      {view.readOnly ? (
        view.figmaValue !== undefined ? (
          <span
            title="This mode has no mapped code context — value shown from Figma (read-only)"
            className="rounded-full border border-vs-border-strong bg-vs-bg-surface px-1.5 py-0.5 text-[10px] font-medium text-vs-text-muted"
          >
            Figma only
          </span>
        ) : null
      ) : view.drift === "drifted" ? (
        <span
          title={`Figma: ${view.figmaValue}`}
          className="rounded-full border border-vs-warning-border bg-vs-warning-muted px-1.5 py-0.5 text-[10px] font-medium text-vs-warning"
        >
          ≠ Figma
        </span>
      ) : view.drift === "in-sync" ? (
        <span title="Matches the Figma variable" className="text-[10px] text-vs-success">
          ✓ Figma
        </span>
      ) : pushableNew ? (
        <span
          title="Not in Figma yet — will be created by “Send to Figma”"
          className="rounded-full border border-vs-accent bg-vs-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-vs-accent"
        >
          ↑ push
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
            <MenuItem onClick={() => { onCopy(view.resolvedValue, "value"); setMenu(false); }}>
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

/** Collapse a token's raw usage entries into one row per component, collecting
 *  the distinct properties/utilities it's used on. */
function groupUsage(usage: TokenUsage[]): { component: string; properties: string[] }[] {
  const byComponent = new Map<string, Set<string>>();
  for (const u of usage) {
    const props = byComponent.get(u.component) ?? new Set<string>();
    if (u.property) props.add(u.property);
    byComponent.set(u.component, props);
  }
  return [...byComponent.entries()].map(([component, props]) => ({
    component,
    properties: [...props],
  }));
}

function TokenDrawer({
  token,
  view,
  modeLabel,
  usage,
  tokenFile,
  busy,
  onClose,
  onSave,
  onRename,
  onDelete,
  canOpen,
  onOpenComponent,
}: {
  token: InspectorToken;
  /** The active-mode values to edit/display (falls back to the flat default). */
  view: ModeView;
  /** The active mode name when the collection is multi-mode (for the editor label), else null. */
  modeLabel: string | null;
  usage: TokenUsage[];
  tokenFile: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, value: string) => Promise<void>;
  onRename: (name: string, newName: string) => void;
  onDelete: (name: string) => void;
  /** Whether a where-used component resolves to an openable source file. */
  canOpen: (component: string) => boolean;
  /** Jump to a where-used component's source. */
  onOpenComponent: (component: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(view.rawValue);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(token.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const src = SOURCE[token.source];
  const isColor = token.type === "color";
  const dirty = value.trim() !== view.rawValue.trim();
  const colorHex = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#000000";

  async function save(): Promise<void> {
    if (!dirty || view.readOnly) return;
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

        <Field label={modeLabel ? `Value · ${modeLabel}` : "Value"}>
          {view.readOnly ? (
            <div className="rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 font-mono text-xs text-vs-text-muted">
              {view.resolvedValue}
              <span className="ml-2 not-italic text-[10px] text-vs-text-muted">
                read-only — no code context mapped to this mode
              </span>
            </div>
          ) : (
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
          )}
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

        {/* figma reconciliation — scoped to the active mode */}
        {view.figmaValue !== undefined && (
          <div className="flex flex-col gap-2 rounded-lg border border-vs-border-default bg-vs-bg-primary p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
                Figma variable{modeLabel ? ` · ${modeLabel}` : ""}
              </span>
              {view.readOnly ? (
                <span className="text-[10px] text-vs-text-muted">read-only</span>
              ) : view.drift === "drifted" ? (
                <span className="rounded-full border border-vs-warning-border bg-vs-warning-muted px-1.5 py-0.5 text-[10px] font-medium text-vs-warning">
                  drifted
                </span>
              ) : (
                <span className="text-[10px] text-vs-success">in sync</span>
              )}
              {token.figmaPath && (
                <span className="ml-auto font-mono text-[10px] text-vs-text-muted">
                  {token.figmaPath}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-vs-text-muted">Figma</span>
              <span className="text-vs-text-primary">{view.figmaValue}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-vs-text-muted">Code</span>
              <span className={view.drift === "drifted" ? "text-vs-warning" : "text-vs-text-primary"}>
                {view.resolvedValue}
              </span>
            </div>
            {view.drift === "drifted" && !view.readOnly && (
              <button
                onClick={() => setValue(view.figmaValue ?? value)}
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
            groupUsage(usage).map(({ component, properties }) => {
              const openable = canOpen(component);
              return (
                <button
                  key={component}
                  type="button"
                  disabled={!openable}
                  onClick={() => onOpenComponent(component)}
                  title={openable ? "Open this component's source" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left ${
                    openable ? "hover:bg-vs-bg-elevated" : "cursor-default"
                  }`}
                >
                  <span className={`text-xs ${openable ? "text-vs-accent" : "text-vs-text-primary"}`}>
                    {component}
                  </span>
                  {properties.length > 0 && (
                    <span className="flex flex-wrap justify-end gap-1">
                      {properties.map((p) => (
                        <span key={p} className="rounded bg-vs-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-vs-text-secondary">
                          {p}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })
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
          disabled={!dirty || saving || view.readOnly}
          onClick={() => void save()}
          className={`rounded-lg px-4 py-2 text-xs font-medium ${
            dirty && !saving && !view.readOnly
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
