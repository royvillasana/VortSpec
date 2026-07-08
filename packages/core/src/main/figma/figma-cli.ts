import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { app } from "electron";
import { execFileSafe } from "../util/exec";
import { FIGMA_VARS_PATH } from "../inspector/figma-reconcile";
import type { FigmaConnection, FigmaCliMode, FigmaSyncResult } from "@vortspec/core/figma";
import type { FigmaVariable, TokenType } from "@vortspec/core/inspector";

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

// ── Reading variables (step 1's primary reader) ──────────────────────

/** Map a W3C DTCG `$type` (+ name hint) to VortSpec's token type. Pure. */
export function mapDtcgType($type: string | undefined, name: string): TokenType {
  const t = ($type ?? "").toLowerCase();
  if (t === "color" || t === "gradient") return "color";
  if (t === "shadow" || t === "boxshadow") return "shadow";
  if (
    t === "typography" ||
    t === "fontfamily" ||
    t === "fontweight" ||
    t === "fontsize" ||
    t === "lineheight" ||
    t === "letterspacing"
  )
    return "typography";
  if (/radius|corner|rounded/i.test(name)) return "radius";
  if (t === "dimension" || t === "number" || t === "duration") return "spacing";
  return "other";
}

/** Stringify a DTCG `$value` to a concrete display value (objects → JSON). */
function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Flatten a W3C Design Tokens (DTCG) tree — as emitted by `figma-cli export
 * dtcg` — into flat FigmaVariable rows. A node is a leaf when it carries a
 * `$value`; its name is the slash-joined path. `$type` is inherited from the
 * nearest ancestor that declares one. Pure + exported for unit testing.
 */
export function dtcgToVariables(dtcg: unknown): FigmaVariable[] {
  const out: FigmaVariable[] = [];
  const walk = (node: unknown, path: string[], inheritedType: string | undefined): void => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const declaredType = typeof obj.$type === "string" ? obj.$type : inheritedType;
    if ("$value" in obj) {
      const name = path.join("/");
      if (name) {
        out.push({
          name,
          resolvedValue: stringifyValue(obj.$value),
          type: mapDtcgType(declaredType, name),
        });
      }
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith("$")) continue; // $description, $extensions, etc.
      walk(child, [...path, key], declaredType);
    }
  };
  walk(dtcg, [], undefined);
  return out;
}

/**
 * Step 1's PRIMARY reader: export the connected file's design variables through
 * figma-cli and write them to `.vortspec/figma-variables.json` (the same cache
 * the Inspector reconciles against). Returns `source: null` when the CLI isn't
 * available so the caller can fall back to the scoped-Claude MCP export.
 */
export async function syncVariablesToCache(projectPath: string): Promise<FigmaSyncResult> {
  const conn = await getConnection();
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
    let vars: FigmaVariable[];
    try {
      vars = dtcgToVariables(JSON.parse(raw));
    } catch {
      return {
        ok: false,
        count: 0,
        source: "cli",
        mode: conn.mode,
        message: "figma-cli returned an export VortSpec couldn't parse.",
      };
    }
    await mkdir(join(projectPath, ".vortspec"), { recursive: true });
    await writeFile(join(projectPath, FIGMA_VARS_PATH), `${JSON.stringify(vars, null, 2)}\n`, "utf8");
    return {
      ok: true,
      count: vars.length,
      source: "cli",
      mode: conn.mode,
      message: `Read ${vars.length} Figma variable${vars.length === 1 ? "" : "s"} via figma-cli${
        conn.mode ? ` (${conn.mode} mode)` : ""
      }.`,
    };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}
