import crypto from "node:crypto";
import type { WebContents } from "electron";
import { IdeMcpBridge } from "./bridge";
import { IDE_TOOLS, type IdeMcpHost, type IdeToolResult } from "./protocol";
import { IDE_ACTION_CHANNEL, type IdeState, type IdeActionResult } from "@vortspec/core/ide-mcp";

/**
 * The IDE-side host behind {@link IdeMcpBridge}. Reads are answered from a cache
 * the renderer keeps fresh (`ide:reportState`); actions are pushed to the
 * renderer, which runs them — with a confirmation for workspace-changing ones —
 * and replies (`ide:resolveAction`). A single bridge/host is lazily started when
 * the renderer first asks for the `--mcp-config` path.
 */

const READ_TOOLS = new Set(["get_workspace_folders", "get_open_editors", "get_selection"]);
const ACTION_TIMEOUT_MS = 120_000;

let bridge: IdeMcpBridge | null = null;
let sender: WebContents | null = null;
let state: IdeState = { workspaceRoot: null, activeFile: null, openEditors: [], selection: null };
const pending = new Map<string, (r: IdeToolResult) => void>();

function readTool(tool: string): IdeToolResult {
  if (tool === "get_workspace_folders") {
    return {
      ok: true,
      message: state.workspaceRoot ? `Open workspace folder: ${state.workspaceRoot}` : "No folder is open in the IDE.",
    };
  }
  if (tool === "get_open_editors") {
    if (state.openEditors.length === 0) return { ok: true, message: "No files are open in the editor." };
    const active = state.activeFile ? ` (active: ${state.activeFile})` : "";
    return { ok: true, message: `Open editor tabs: ${state.openEditors.join(", ")}${active}` };
  }
  // get_selection
  const s = state.selection;
  if (!s) {
    return {
      ok: true,
      message: state.activeFile ? `No selection. The active file is ${state.activeFile}.` : "No selection; no file is open.",
    };
  }
  const range = s.startLine === s.endLine ? `line ${s.startLine}` : `lines ${s.startLine}–${s.endLine}`;
  return { ok: true, message: `Selection in ${s.path}, ${range}:\n${s.text}` };
}

const host: IdeMcpHost = {
  catalog: () => IDE_TOOLS,
  invoke: async (tool, args) => {
    if (READ_TOOLS.has(tool)) return readTool(tool);
    // Action: dispatch to the renderer and await its result (it confirms the
    // workspace-changing ones). The renderer is the sole place state changes.
    if (!sender || sender.isDestroyed()) {
      return { ok: false, message: "The IDE window is not available to perform that action." };
    }
    const requestId = crypto.randomUUID();
    return await new Promise<IdeToolResult>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve({ ok: false, message: "The IDE did not respond to the action in time." });
      }, ACTION_TIMEOUT_MS);
      pending.set(requestId, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      sender!.send(IDE_ACTION_CHANNEL, { requestId, tool, args });
    });
  },
};

/** Lazily start the bridge and return the `--mcp-config` path for assistant runs. */
export async function ideMcpConfigPath(webContents: WebContents): Promise<{ path: string } | null> {
  sender = webContents;
  if (!bridge) {
    bridge = new IdeMcpBridge(host);
    await bridge.start();
  }
  return { path: bridge.mcpConfigPath() };
}

/** The Claude allow-list group that turns our tools on for a run. */
export function ideMcpToolGroup(): string {
  return IdeMcpBridge.allowedToolGroup();
}

export function reportIdeState(next: IdeState): { ok: boolean } {
  state = next;
  return { ok: true };
}

export function resolveIdeAction(result: IdeActionResult): { ok: boolean } {
  const resolve = pending.get(result.requestId);
  if (resolve) {
    pending.delete(result.requestId);
    resolve({ ok: result.ok, message: result.message });
  }
  return { ok: true };
}

/** Tear down on quit — closes the socket and removes temp files. */
export function stopIdeMcp(): void {
  for (const resolve of pending.values()) resolve({ ok: false, message: "The IDE is shutting down." });
  pending.clear();
  bridge?.close();
  bridge = null;
  sender = null;
}
