import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { app } from "electron";
import { execFileSafe } from "../util/exec";
import { FIGMA_VARS_PATH, FIGMA_COMPONENTS_PATH } from "../inspector/figma-reconcile";
import { writeCanonicalTokens } from "../inspector/canonical-tokens";
import { emitAfterIngest } from "../inspector/token-emit";
import type { TokenEmitSummary } from "@vortspec/core/token-emit-ledger";
import {
  canonicalFromDtcgExport,
  canonicalFromVariableModel,
  projectCanonicalToVariables,
  validateCanonicalTokens,
} from "@vortspec/core/canonical-tokens";
import type { DesignTokenDocument } from "@vortspec/core/design-tokens";
import type {
  FigmaConnection,
  FigmaCliMode,
  FigmaSyncResult,
  FigmaComponent,
  FigmaNode,
  FigmaSelection,
} from "@vortspec/core/figma";
import type {
  FigmaVariableModel,
  PushPlan,
  FigmaPushResult,
} from "@vortspec/core/inspector";
import { figmaVariableModelSchema } from "@vortspec/core/inspector";

/**
 * Drives the local figma-cli (github.com/silships/figma-cli) — VortSpec's
 * primary Figma connection. Every call is an argument array confined to the CLI
 * directory (never a shell string). Missing/unconnected states surface as
 * fix-it guidance rather than raw errors; the MCP bridge + REST token remain the
 * fallbacks upstream.
 */

/** Where figma-cli is installed (overridable for tests / custom setups). */
export function figmaCliDir(): string {
  return process.env.VORTSPEC_FIGMA_CLI_DIR || join(homedir(), "figma-cli");
}

function entryPoint(): string {
  return join(figmaCliDir(), "src", "index.js");
}

export function isInstalled(): boolean {
  return existsSync(entryPoint());
}

function appName(): string {
  try {
    return app.getName();
  } catch {
    return "VortSpec";
  }
}

function run(args: string[], timeoutMs = 8000): ReturnType<typeof execFileSafe> {
  return execFileSafe("node", [entryPoint(), ...args], { cwd: figmaCliDir(), timeoutMs });
}

/**
 * Parse the `files` command's JSON output into file names. Pure + exported for
 * unit testing. Tolerant of a leading banner before the JSON array.
 */
export function parseFilesJson(raw: string): string[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((f) => {
        if (typeof f === "string") return f;
        if (f && typeof f === "object") {
          const o = f as Record<string, unknown>;
          return String(o.name ?? o.title ?? o.fileName ?? "");
        }
        return "";
      })
      .filter((s): s is string => Boolean(s));
  } catch {
    return [];
  }
}

/** Infer the active connection mode from diagnostic output. Pure + tested. */
export function parseMode(text: string): FigmaCliMode | null {
  if (/safe\s*mode/i.test(text)) return "safe";
  if (/yolo|cdp|direct/i.test(text)) return "yolo";
  return null;
}

export async function getConnection(): Promise<FigmaConnection> {
  const cliDir = figmaCliDir();
  const name = appName();
  if (!isInstalled()) {
    return {
      installed: false,
      cliDir,
      daemonRunning: false,
      connected: false,
      mode: null,
      openFiles: [],
      appName: name,
      message: "figma-cli isn't installed yet. VortSpec can set it up for you.",
    };
  }

  const status = await run(["daemon", "status"], 6000);
  const daemonRunning = /running/i.test(status.stdout);

  const files = await run(["files"], 8000);
  const openFiles = parseFilesJson(files.stdout);
  const connected =
    files.code === 0 &&
    files.stdout.includes("[") &&
    !/not connected|no connection|failed|error/i.test(`${files.stdout}\n${files.stderr}`);

  const debug = await run(["daemon", "status", "--debug"], 6000);
  const mode = parseMode(`${debug.stdout}\n${status.stdout}`);

  return {
    installed: true,
    cliDir,
    daemonRunning,
    connected,
    mode,
    openFiles,
    appName: name,
    message: connected
      ? `Connected to Figma Desktop${mode ? ` (${mode} mode)` : ""}.`
      : daemonRunning
        ? "The daemon is running but not connected to Figma yet."
        : "figma-cli is installed but not connected.",
  };
}

/**
 * Open macOS System Settings → Privacy & Security → App Management, where the
 * user enables this app so yolo mode can patch Figma Desktop.
 */
export async function openAppManagementSettings(): Promise<void> {
  await execFileSafe(
    "open",
    ["x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AppBundles"],
    { cwd: homedir(), timeoutMs: 5000 },
  );
}

/** Attempt a connection in the given mode, then report the resulting status. */
export async function connect(mode: FigmaCliMode): Promise<FigmaConnection> {
  if (!isInstalled()) return getConnection();
  await run(mode === "safe" ? ["connect", "--safe"] : ["connect"], 60000);
  return getConnection();
}

// ── Auto-connect: keep the CLI ready so the user never runs it by hand ──────
//
// The daemon persists once connected, so this short-circuits on the common
// path. When installed-but-disconnected it connects automatically (preferring
// the last mode that worked, then yolo→safe), remembers the winning mode, and
// self-heals a dropped connection. Single-flight so warm-up + a concurrent
// sync/push don't race two `connect` runs. The one-time first setup (install +
// grant App Management / import the plugin) still can't be headless.

/** In-memory cache of the last mode that connected; avoids a disk read per call. */
let cachedMode: FigmaCliMode | null = null;
/** The in-flight connect, shared by concurrent callers (warm-up + sync/push). */
let connecting: Promise<FigmaConnection> | null = null;

function modePath(): string {
  return join(app.getPath("userData"), "figma-cli.json");
}

async function readPreferredMode(): Promise<FigmaCliMode | null> {
  if (cachedMode) return cachedMode;
  try {
    const parsed = JSON.parse(await readFile(modePath(), "utf8")) as { mode?: unknown };
    if (parsed.mode === "yolo" || parsed.mode === "safe") return (cachedMode = parsed.mode);
  } catch {
    /* no remembered mode yet */
  }
  return null;
}

async function rememberMode(mode: FigmaCliMode | null): Promise<void> {
  if (!mode || mode === cachedMode) {
    cachedMode = mode ?? cachedMode;
    return;
  }
  cachedMode = mode;
  try {
    await mkdir(dirname(modePath()), { recursive: true });
    await writeFile(modePath(), `${JSON.stringify({ mode })}\n`, "utf8");
  } catch {
    /* best-effort persistence */
  }
}

/** The order to try connection modes, preferring the last-working one. Pure + tested. */
export function connectModeOrder(preferred: FigmaCliMode | null): FigmaCliMode[] {
  return preferred === "safe" ? ["safe", "yolo"] : ["yolo", "safe"];
}

/**
 * Ensure figma-cli is connected, connecting automatically if it isn't. Returns
 * the resulting connection (never throws). A no-op fast path when not installed
 * or already connected; otherwise attempts each mode in `connectModeOrder` until
 * one connects. Callers that need the CLI (sync/push) and the on-open warm-up
 * both go through here, so the user never runs a connect command by hand.
 */
export async function ensureConnected(): Promise<FigmaConnection> {
  if (!isInstalled()) return getConnection();
  const current = await getConnection();
  if (current.connected) {
    await rememberMode(current.mode);
    return current;
  }
  if (connecting) return connecting;
  connecting = (async () => {
    const preferred = await readPreferredMode();
    for (const mode of connectModeOrder(preferred)) {
      const conn = await connect(mode);
      if (conn.connected) {
        await rememberMode(conn.mode ?? mode);
        return conn;
      }
    }
    // Neither mode connected (first-time setup needed) — report the real status;
    // callers fall back to the Figma MCP or surface a fix-it.
    return getConnection();
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

// ── Reading variables (step 1's primary reader) ──────────────────────

/**
 * `mapDtcgType` and `dtcgToVariables` now live in `shared/canonical-tokens.ts` and are re-exported
 * here so every existing importer is untouched (OpenSpec change: agentic-design-system, task 7.3).
 * They moved because flattening is no longer an INGEST step that happens to live next to the CLI —
 * it is a read-time projection over the canonical artifact, and the projection has to stay fs-free
 * to be usable from anywhere and testable on its own.
 */
export { mapDtcgType, projectCanonicalToVariables as dtcgToVariables } from "@vortspec/core/canonical-tokens";

/**
 * Build the figma-cli `eval` that reads the full mode/group/alias-aware variable
 * model straight from the Variables plugin API — the authoritative capture path
 * (change: figma-native-token-model). Unlike the DTCG export it keeps every
 * mode's value, the slash group path (via `v.name`), the resolvedType, and alias
 * references. Returns a JSON string matching `figmaVariableModelSchema`. Pure +
 * exported for unit testing. Verify plugin-API shapes against current docs.
 */
export function buildVariablesFetchScript(): string {
  return `(async function () {
  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  var vars = await figma.variables.getLocalVariablesAsync();
  var byId = {}; vars.forEach(function(v){ byId[v.id] = v; });
  var colById = {}; cols.forEach(function(c){ colById[c.id] = c; });
  function h(x){ var s = Math.round((x||0)*255).toString(16); return s.length===1?'0'+s:s; }
  function rgbaToHex(c){
    if (!c || typeof c !== 'object') return '';
    var hex = '#'+h(c.r)+h(c.g)+h(c.b);
    if (c.a !== undefined && c.a < 1) hex += h(c.a);
    return hex;
  }
  function scalar(val, type){
    if (type === 'COLOR') return rgbaToHex(val);
    if (type === 'BOOLEAN') return String(val);
    return String(val);
  }
  // Follow an alias chain to a concrete display value within a mode (bounded).
  function resolveConcrete(val, type, modeId, depth){
    if (depth > 10) return '';
    if (val && val.type === 'VARIABLE_ALIAS'){
      var tv = byId[val.id];
      if (!tv) return '';
      var tvv = tv.valuesByMode[modeId];
      if (tvv === undefined){ var ks = Object.keys(tv.valuesByMode); tvv = tv.valuesByMode[ks[0]]; }
      return resolveConcrete(tvv, tv.resolvedType, modeId, depth+1);
    }
    return scalar(val, type);
  }
  var variables = vars.map(function(v){
    var col = colById[v.variableCollectionId];
    var modes = col ? col.modes : [{ modeId: '__default', name: 'Default' }];
    var valuesByMode = {};
    modes.forEach(function(m){
      var raw = v.valuesByMode[m.modeId];
      var entry = {};
      if (raw && raw.type === 'VARIABLE_ALIAS'){ var tgt = byId[raw.id]; if (tgt) entry.aliasOf = tgt.name; }
      entry.value = resolveConcrete(raw, v.resolvedType, m.modeId, 0);
      valuesByMode[m.name] = entry;
    });
    var defMode = col ? (col.modes.filter(function(mm){return mm.modeId===col.defaultModeId;})[0] || col.modes[0]) : null;
    var defVal = defMode && valuesByMode[defMode.name] ? valuesByMode[defMode.name].value : '';
    // v.key is the publish-stable durable key (empty for a local/unpublished variable).
    return { name: v.name, key: v.key || undefined, collection: col ? col.name : undefined, resolvedType: v.resolvedType, resolvedValue: defVal || '', valuesByMode: valuesByMode };
  });
  var collections = cols.map(function(c){
    return { name: c.name, modes: c.modes.map(function(m){ return { id: m.modeId, name: m.name }; }), defaultModeId: c.defaultModeId };
  });
  return JSON.stringify({ collections: collections, variables: variables });
})();`;
}

/**
 * Parse the variables-fetch `eval` output (a JSON model string, possibly behind a
 * CLI banner) into a validated `FigmaVariableModel`. Returns null when no JSON
 * object is present or it fails validation. Pure + exported for unit testing.
 */
export function parseVariablesFetch(raw: string): FigmaVariableModel | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = figmaVariableModelSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// ── Reading the current selection (Wave 3 convenience) ───────────────

/** A figma-use `eval` that returns the current page's selected nodes as JSON. */
export const SELECTION_SCRIPT =
  '(figma.currentPage.selection || []).map(function (n) { return { id: n.id, name: n.name, type: n.type }; });';

/**
 * Parse the selection `eval` output (a JSON array, possibly behind a banner)
 * into FigmaNode rows. Pure + exported for unit testing. Skips malformed rows.
 */
export function parseSelectionEval(raw: string): FigmaNode[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: FigmaNode[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const name = typeof r.name === "string" ? r.name : "";
    const type = typeof r.type === "string" ? r.type : "";
    if (!id || !name) continue;
    out.push({ id, name, type });
  }
  return out;
}

/**
 * Read the node(s) currently selected in Figma Desktop through figma-cli, so
 * the user can build "this frame" straight from their selection. Read-only;
 * `nodes: []` with a guiding message when the CLI is unavailable or nothing is
 * selected. Never throws to the caller.
 */
export async function getSelection(): Promise<FigmaSelection> {
  const conn = await ensureConnected();
  if (!conn.installed || !conn.connected) {
    return {
      nodes: [],
      message: conn.installed
        ? "figma-cli isn't connected to Figma Desktop yet."
        : "figma-cli isn't set up.",
    };
  }
  const tmp = join(tmpdir(), `vortspec-figma-selection-${process.pid}-${Date.now()}.js`);
  try {
    await writeFile(tmp, SELECTION_SCRIPT, "utf8");
    const res = await run(["eval", "--file", tmp], 12000);
    const nodes = parseSelectionEval(res.stdout);
    return {
      nodes,
      message: nodes.length
        ? `${nodes.length} node${nodes.length === 1 ? "" : "s"} selected in Figma.`
        : "Nothing selected in Figma — select a component or frame, then try again.",
    };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

// ── Reading components (Wave 3) ──────────────────────────────────────

/**
 * A figma-use `eval` script that enumerates the design system's real
 * components — every COMPONENT_SET (with its variant axes) plus top-level
 * COMPONENTs (parented to a PAGE/SECTION) — and returns them as a JSON array.
 * Deliberately skips variant children and deeply-nested/icon instances so the
 * result is the DS roster, not thousands of nodes. Returned as the last
 * expression (a Promise), which `eval --file` awaits.
 */
export const READ_COMPONENTS_SCRIPT = `figma.loadAllPagesAsync().then(function () {
  var ns = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] });
  var seen = {}; var out = [];
  for (var i = 0; i < ns.length; i++) {
    var n = ns[i];
    var pt = n.parent && n.parent.type;
    if (n.type === "COMPONENT" && !(pt === "PAGE" || pt === "SECTION")) continue;
    if (seen[n.name]) continue; seen[n.name] = 1;
    var variants = [];
    if (n.type === "COMPONENT_SET") { try { variants = Object.keys(n.variantGroupProperties || {}); } catch (e) {} }
    // n.key is the publish-stable componentKey (empty for an unpublished component).
    out.push({ name: n.name, isSet: n.type === "COMPONENT_SET", variants: variants, key: n.key || undefined, id: n.id });
  }
  return out;
});`;

/**
 * Parse the `eval` output (a JSON array, possibly behind a CLI banner) into
 * FigmaComponent rows. Pure + exported for unit testing. Tolerant of malformed
 * rows; dedupes by name.
 */
export function parseComponentsEval(raw: string): FigmaComponent[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: FigmaComponent[] = [];
  const seen = new Set<string>();
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const variants = Array.isArray(r.variants)
      ? r.variants.filter((v): v is string => typeof v === "string")
      : [];
    const key = typeof r.key === "string" && r.key ? r.key : undefined;
    const id = typeof r.id === "string" && r.id ? r.id : undefined;
    out.push({ name, isSet: Boolean(r.isSet), variants, key, id });
  }
  return out;
}

/**
 * Wave 3 reader: enumerate the connected file's design-system components via
 * figma-cli and write them to `.vortspec/figma-components.json` (the cache the
 * Inspector reconciles the code roster against). Symmetric with
 * `syncVariablesToCache`; `source: null` when the CLI is unavailable.
 */
export async function syncComponentsToCache(projectPath: string): Promise<FigmaSyncResult> {
  const conn = await ensureConnected();
  if (!conn.installed) {
    return {
      ok: false,
      count: 0,
      source: null,
      mode: null,
      message: "figma-cli isn't set up. Set it up for the fast path, or sync via the Figma MCP instead.",
    };
  }
  if (!conn.connected) {
    return {
      ok: false,
      count: 0,
      source: null,
      mode: conn.mode,
      message: "figma-cli isn't connected to Figma Desktop yet. Connect it, or sync via the Figma MCP instead.",
    };
  }

  const tmp = join(tmpdir(), `vortspec-figma-components-${process.pid}-${Date.now()}.js`);
  try {
    await writeFile(tmp, READ_COMPONENTS_SCRIPT, "utf8");
    const res = await run(["eval", "--file", tmp], 30000);
    const components = parseComponentsEval(res.stdout);
    if (components.length === 0 && !res.stdout.includes("[")) {
      const detail = (res.stderr || res.stdout || "").split("\n").find((l) => l.trim()) ?? "";
      return {
        ok: false,
        count: 0,
        source: "cli",
        mode: conn.mode,
        message: `figma-cli couldn't read components from the focused file.${detail ? ` (${detail.trim()})` : ""}`,
      };
    }
    await mkdir(join(projectPath, ".vortspec"), { recursive: true });
    await writeFile(
      join(projectPath, FIGMA_COMPONENTS_PATH),
      `${JSON.stringify(components, null, 2)}\n`,
      "utf8",
    );
    return {
      ok: true,
      count: components.length,
      source: "cli",
      mode: conn.mode,
      message: `Read ${components.length} Figma component${components.length === 1 ? "" : "s"} via figma-cli${
        conn.mode ? ` (${conn.mode} mode)` : ""
      }.`,
    };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** How many dropped names to spell out before summarising the rest. */
const DROPPED_NAMES_SHOWN = 5;

/**
 * The human sentence for a successful variable read — pure + exported so the reporting of a DROPPED
 * variable is testable without a Figma connection.
 *
 * `dropped` is the list `canonicalFromVariableModel` returns for variables that cannot be
 * represented as DTCG nesting (`color/primary` and `color/primary/500` cannot both be tokens). It
 * MUST reach the user: a variable that vanishes between Figma and `.vortspec/tokens.json` while the
 * sync reports "read N variables" is precisely the silent loss this change exists to remove. The
 * names are spelled out, capped, because the fix is to rename one of them in Figma and that needs
 * the name.
 */
export function variableSyncMessage(opts: {
  written: number;
  collections: number;
  modeCount: number;
  dropped: readonly string[];
  mode: FigmaCliMode | null;
  emit?: TokenEmitSummary;
}): string {
  const { written, collections, modeCount, dropped, mode, emit } = opts;
  const head =
    `Read ${written} Figma variable${written === 1 ? "" : "s"}` +
    ` across ${collections} collection${collections === 1 ? "" : "s"}` +
    `${modeCount > 1 ? ` (${modeCount} modes)` : ""}` +
    ` via figma-cli${mode ? ` (${mode} mode)` : ""}.`;
  const parts = [head];
  if (dropped.length) {
    const shown = dropped.slice(0, DROPPED_NAMES_SHOWN).join(", ");
    const rest = dropped.length - DROPPED_NAMES_SHOWN;
    parts.push(
      `${dropped.length} variable${dropped.length === 1 ? "" : "s"} couldn't be written as a` +
        ` design token because the name collides with another variable's group: ` +
        `${shown}${rest > 0 ? `, +${rest} more` : ""}.`,
    );
  }
  // The emit's outcome rides in the sync's own sentence, not only in a field the UI might not read.
  // A `diverged` emit in particular is a CHOICE the user owes — reporting the read as a plain
  // success while the token file silently stayed stale is the failure mode task 7.14 exists to close.
  if (emit && emit.status !== "up-to-date" && emit.status !== "written") parts.push(emit.message);
  return parts.join(" ");
}

/**
 * Step 1's PRIMARY reader: export the connected file's design variables through
 * figma-cli and write BOTH the canonical artifact `.vortspec/tokens.json` (W3C
 * DTCG, the group tree intact — OpenSpec change: agentic-design-system, task
 * 7.2) and `.vortspec/figma-variables.json` (the flat cache the Inspector still
 * reconciles against). Returns `source: null` when the CLI isn't available so
 * the caller can fall back to the scoped-Claude MCP export.
 *
 * Two files on purpose, for now: the canonical artifact is being adopted
 * ALONGSIDE the existing cache so a project that has only `figma-variables.json`
 * keeps working unchanged. Task 7.13 retires the cache once every reader has
 * moved to the projection.
 */
export async function syncVariablesToCache(projectPath: string): Promise<FigmaSyncResult> {
  const conn = await ensureConnected();
  if (!conn.installed) {
    return {
      ok: false,
      count: 0,
      source: null,
      mode: null,
      message: "figma-cli isn't set up. Set it up for the fast path, or sync via the Figma MCP instead.",
    };
  }
  if (!conn.connected) {
    return {
      ok: false,
      count: 0,
      source: null,
      mode: conn.mode,
      message: "figma-cli isn't connected to Figma Desktop yet. Connect it, or sync via the Figma MCP instead.",
    };
  }

  // PRIMARY: read the full mode/group/alias-aware model via the Variables plugin
  // API (change: figma-native-token-model). Falls back to the DTCG export when the
  // eval path is unavailable, so this never regresses below the prior behavior.
  const model = await fetchVariableModelViaEval();
  if (model) {
    await mkdir(join(projectPath, ".vortspec"), { recursive: true });
    await writeFile(join(projectPath, FIGMA_VARS_PATH), `${JSON.stringify(model, null, 2)}\n`, "utf8");
    const { document, dropped } = canonicalFromVariableModel(model, {
      source: "figma",
      generatedAt: new Date().toISOString(),
    });
    await writeCanonicalTokens(projectPath, document);
    // Emit as the tail of the ingest (task 7.14) — this is what makes `token_file` derived rather
    // than a file someone has to remember to regenerate. Never throws; a project with no styling
    // configured comes back `skipped` and the sync still succeeds.
    const emit = await emitAfterIngest(projectPath);
    const modeCount = new Set(model.collections.flatMap((c) => c.modes.map((m) => m.name))).size;
    return {
      emit,
      // `count` is what was PERSISTED, not what was read: a variable the canonical artifact could
      // not represent is named in the message rather than counted as if it had landed.
      ok: true,
      count: model.variables.length - dropped.length,
      source: "cli",
      mode: conn.mode,
      message: variableSyncMessage({
        written: model.variables.length - dropped.length,
        collections: model.collections.length,
        modeCount,
        dropped,
        mode: conn.mode,
        emit,
      }),
    };
  }

  const tmp = join(tmpdir(), `vortspec-dtcg-${process.pid}-${Date.now()}.json`);
  try {
    const res = await run(["export", "dtcg", tmp], 30000);
    let raw: string;
    try {
      raw = await readFile(tmp, "utf8");
    } catch {
      const detail = (res.stderr || res.stdout || "").split("\n").find((l) => l.trim()) ?? "";
      return {
        ok: false,
        count: 0,
        source: "cli",
        mode: conn.mode,
        message: `figma-cli couldn't export variables from the focused file.${detail ? ` (${detail.trim()})` : ""}`,
      };
    }
    // The export tree is persisted UNMODIFIED as the canonical artifact (task 7.2) — nesting,
    // aliases and descriptions intact — and the flat cache is DERIVED from it by the same read-time
    // projection every other consumer uses, so the two can never disagree about what was read.
    let document: DesignTokenDocument | null;
    try {
      document = canonicalFromDtcgExport(JSON.parse(raw), {
        source: "figma",
        generatedAt: new Date().toISOString(),
      });
    } catch {
      document = null;
    }
    if (!document) {
      return {
        ok: false,
        count: 0,
        source: "cli",
        mode: conn.mode,
        message: "figma-cli returned an export that wasn't a token document.",
      };
    }
    const vars = projectCanonicalToVariables(document);
    await mkdir(join(projectPath, ".vortspec"), { recursive: true });
    await writeCanonicalTokens(projectPath, document);
    await writeFile(join(projectPath, FIGMA_VARS_PATH), `${JSON.stringify(vars, null, 2)}\n`, "utf8");
    const emit = await emitAfterIngest(projectPath); // task 7.14, as above
    // The export is written whatever its shape — refusing it would leave the previous cache in place
    // and lose every valid token over one non-token branch. Structural problems are REPORTED here
    // instead, so the read stays honest without becoming destructive.
    const violations = validateCanonicalTokens(document).violations;
    return {
      emit,
      ok: true,
      count: vars.length,
      source: "cli",
      mode: conn.mode,
      message:
        `Read ${vars.length} Figma variable${vars.length === 1 ? "" : "s"} via figma-cli${
          conn.mode ? ` (${conn.mode} mode)` : ""
        }.` +
        (violations.length
          ? ` The export has ${violations.length} structural issue${
              violations.length === 1 ? "" : "s"
            } (${violations[0].code}${violations[0].path ? ` at ${violations[0].path}` : ""}).`
          : "") +
        (emit.status !== "up-to-date" && emit.status !== "written" ? ` ${emit.message}` : ""),
    };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

/**
 * Run the variables-fetch `eval` and parse it into a validated model. Returns null
 * on any failure so `syncVariablesToCache` can fall back to the DTCG export.
 */
async function fetchVariableModelViaEval(): Promise<FigmaVariableModel | null> {
  const tmp = join(tmpdir(), `vortspec-figvars-${process.pid}-${Date.now()}.js`);
  try {
    await writeFile(tmp, buildVariablesFetchScript(), "utf8");
    const res = await run(["eval", "--file", tmp], 30000);
    return parseVariablesFetch(res.stdout);
  } catch {
    return null;
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

// ── Writing variables: code → Figma push (change: add-code-to-figma-token-push) ──

/**
 * Build the figma-cli `eval` script that applies a push plan to Figma Variables.
 * Pure + exported for testing. Isolated CLI/plugin-API knowledge (verify the
 * variables API shape against current docs at implementation time). Creates or
 * updates each variable in VortSpec's own collection — auto-creating that
 * collection when it doesn't exist — binding aliases where the plan specifies
 * one, and returns a JSON summary as its last expression:
 *   { error: null, created, updated, createdCollection, failed, errors[] }
 * Each entry is coerced to the variable's actual resolved type and wrapped in a
 * try/catch, so one bad token is skipped-and-reported, not fatal to the push.
 */
export function buildPushScript(plan: PushPlan): string {
  return `(async function () {
  var PLAN = ${JSON.stringify(plan)};
  function norm(s){ return String(s).replace(/^--/,'').trim().toLowerCase().replace(/[\\s\\/._]+/g,'-').replace(/-+/g,'-'); }
  function hexToRgba(hex){
    var h = hex.replace('#','').trim();
    if (h.length === 3 || h.length === 4){ h = h.split('').map(function(c){return c+c;}).join(''); }
    var r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    var a = h.length >= 8 ? parseInt(h.slice(6,8),16)/255 : 1;
    return { r:r, g:g, b:b, a:a };
  }
  // Coerce a raw string to the value shape Figma requires for a variable's
  // ACTUAL resolved type — so setValueForMode never sees a mismatched type.
  function toValue(type, raw){
    if (type === 'FLOAT'){ var m = String(raw).match(/-?\\d*\\.?\\d+/); return m ? Number(m[0]) : 0; }
    if (type === 'BOOLEAN'){ return String(raw).trim().toLowerCase() === 'true'; }
    if (type === 'COLOR'){ var s = String(raw).trim(); return s[0] === '#' ? hexToRgba(s) : { r:0,g:0,b:0,a:1 }; }
    return String(raw);
  }
  function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
  // Layer of a variable name — mirrors pushLayerOf (both '/' and '-' separators).
  function layerOf(name){ var n=String(name).replace(/^--/,''); if(/^primitive[-\\/]/i.test(n)) return 'primitive'; if(/^component[-\\/]/i.test(n)) return 'component'; return 'semantic'; }
  function famOf(tt){ return tt==='color'?'Color':tt==='spacing'?'Spacing':tt==='radius'?'Radius':tt==='shadow'?'Effects':tt==='typography'?'Typography':'Color'; }
  // Standard collection name to fall back to when no sibling collection exists.
  function fallbackName(layer, tt, name){
    if (layer==='component'){ var seg=String(name).replace(/^--/,'').split(/[\\/-]/)[1]||'Tokens'; return 'Component / '+cap(seg); }
    return cap(layer)+' / '+famOf(tt);
  }

  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  var vars = await figma.variables.getLocalVariablesAsync();
  var colById = {}; cols.forEach(function(c){ colById[c.id]=c; });
  var colsByName = {}; cols.forEach(function(c){ colsByName[c.name]=c; });
  // Global index across ALL collections, so a semantic can alias a primitive that
  // lives in a different collection, and same-name variables update in place.
  var globalByNorm = {}; vars.forEach(function(v){ var k=norm(v.name); if(!(k in globalByNorm)) globalByNorm[k]=v; });
  var created = 0, updated = 0, createdCollections = [], errors = [];

  function modeIdFor(col){
    var id = col.defaultModeId || (col.modes[0] && col.modes[0].modeId);
    if (PLAN.mode){ var pm = col.modes.filter(function(m){ return m.name===PLAN.mode; })[0]; if (pm) id = pm.modeId; }
    return id;
  }
  // Adaptive routing: put each variable where its siblings already live, else a
  // standard-named collection (created on demand). Never moves an existing var.
  function pickCollection(e){
    var existing = globalByNorm[norm(e.variable)];
    if (existing) return colById[existing.variableCollectionId];      // update in place
    var best=null, bestN=0;                                           // most siblings of same layer + type
    cols.forEach(function(c){
      var n=0;
      vars.forEach(function(v){ if (v.variableCollectionId===c.id && layerOf(v.name)===e.layer && v.resolvedType===e.figmaType) n++; });
      if (n>bestN){ bestN=n; best=c; }
    });
    if (best) return best;
    var name = fallbackName(e.layer, e.tokenType, e.variable);        // standard fallback
    if (colsByName[name]) return colsByName[name];
    var nc = figma.variables.createVariableCollection(name);
    colsByName[name]=nc; colById[nc.id]=nc; cols.push(nc); createdCollections.push(name);
    return nc;
  }

  for (var i = 0; i < PLAN.entries.length; i++){
    var e = PLAN.entries[i];
    try {
      var col = pickCollection(e);
      var modeId = modeIdFor(col);
      var target = e.aliasTarget ? globalByNorm[norm(e.aliasTarget)] : null;
      var v = globalByNorm[norm(e.variable)];
      if (v && v.variableCollectionId !== col.id) v = null;           // don't reuse a var from another collection
      if (!v){
        var newType = (target && target.resolvedType) ? target.resolvedType : e.figmaType;
        v = figma.variables.createVariable(e.variable, col, newType);
        globalByNorm[norm(e.variable)] = v; vars.push(v); created++;
      } else { updated++; }
      // Alias (possibly cross-collection) when the target's type matches; else concrete.
      if (target && target.resolvedType === v.resolvedType){
        v.setValueForMode(modeId, figma.variables.createVariableAlias(target));
      } else {
        v.setValueForMode(modeId, toValue(v.resolvedType, e.value));
      }
    } catch (err) {
      errors.push({ variable: e.variable, error: String((err && err.message) || err) });
    }
  }
  return { error: null, created: created, updated: updated, createdCollection: createdCollections.length>0, createdCollections: createdCollections, failed: errors.length, errors: errors.slice(0, 5) };
})();`;
}

/** Parse the push `eval` output (a JSON object behind a possible banner). Pure + exported. */
export function parsePushEval(raw: string): {
  error: string | null;
  created: number;
  updated: number;
  createdCollection: boolean;
  failed: number;
  firstError?: string;
} | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  const errs = Array.isArray(r.errors) ? (r.errors as Array<Record<string, unknown>>) : [];
  const firstError =
    errs.length && typeof errs[0]?.error === "string"
      ? `${errs[0].variable ?? "?"}: ${errs[0].error}`
      : undefined;
  return {
    error: typeof r.error === "string" ? r.error : null,
    created: typeof r.created === "number" ? r.created : 0,
    updated: typeof r.updated === "number" ? r.updated : 0,
    createdCollection: r.createdCollection === true,
    failed: typeof r.failed === "number" ? r.failed : 0,
    firstError,
  };
}

/**
 * Apply a confirmed push plan to Figma Variables through figma-cli (the preferred
 * writer; the caller falls back to a scoped Claude Code run when `source: null`).
 * Writes only to VortSpec's own collection, creating it when absent. Never
 * deletes and never throws — connection problems surface as fix-it messages.
 */
export async function pushVariablesToFigma(plan: PushPlan): Promise<FigmaPushResult> {
  const conn = await ensureConnected();
  if (!conn.installed) {
    return { ok: false, created: 0, updated: 0, source: null, message: "figma-cli isn't set up. Set it up, or push via the Figma MCP instead." };
  }
  if (!conn.connected) {
    return { ok: false, created: 0, updated: 0, source: null, message: "figma-cli isn't connected to Figma Desktop yet. Connect it, or push via the Figma MCP instead." };
  }
  if (plan.entries.length === 0) {
    return { ok: true, created: 0, updated: 0, source: "cli", message: "Figma is already in sync — nothing to push." };
  }
  const tmp = join(tmpdir(), `vortspec-figma-push-${process.pid}-${Date.now()}.js`);
  try {
    await writeFile(tmp, buildPushScript(plan), "utf8");
    const res = await run(["eval", "--file", tmp], 60000);
    const parsed = parsePushEval(res.stdout);
    if (!parsed) {
      const detail = (res.stderr || res.stdout || "").split("\n").find((l) => l.trim()) ?? "";
      return { ok: false, created: 0, updated: 0, source: "cli", message: `figma-cli couldn't apply the push.${detail ? ` (${detail.trim()})` : ""}` };
    }
    if (parsed.error) {
      return { ok: false, created: 0, updated: 0, source: "cli", message: `figma-cli reported an error applying the push (${parsed.error}).` };
    }
    const madeCol = parsed.createdCollection ? ` (created the "${plan.collection}" collection)` : "";
    const failedNote = parsed.failed
      ? ` · ${parsed.failed} skipped${parsed.firstError ? ` (e.g. ${parsed.firstError})` : ""}`
      : "";
    return {
      ok: parsed.failed === 0,
      created: parsed.created,
      updated: parsed.updated,
      source: "cli",
      message: `Pushed to Figma — created ${parsed.created}, updated ${parsed.updated} variable${parsed.created + parsed.updated === 1 ? "" : "s"} in "${plan.collection}"${madeCol}${failedNote}.`,
    };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}
