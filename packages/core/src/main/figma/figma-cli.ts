import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { app } from "electron";
import { execFileSafe } from "../util/exec";
import type { FigmaConnection, FigmaCliMode } from "@vortspec/core/figma";

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
