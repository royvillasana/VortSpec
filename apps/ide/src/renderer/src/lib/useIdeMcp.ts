import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import type { IdeAction, IdeState } from "@vortspec/core/ide-mcp";
import { api } from "@vortspec/ui/api";

/** Allow-list group that turns the VortSpec IDE tools on for an assistant run. */
export const IDE_MCP_TOOL_GROUP = "mcp__vortspec-ide";

/** A workspace-changing action awaiting the user's confirmation. */
export interface PendingIdeAction {
  action: IdeAction;
  title: string;
  detail: string;
  confirmLabel: string;
}

/** Human-readable framing for each gated tool (used by the confirmation card). */
function describe(action: IdeAction): PendingIdeAction | null {
  const a = action.args ?? {};
  switch (action.tool) {
    case "open_folder":
      return {
        action,
        title: "Open a folder?",
        detail: a.path ? `The assistant wants to open ${String(a.path)} as the workspace.` : "The assistant wants you to pick a folder to open as the workspace.",
        confirmLabel: "Open folder",
      };
    case "clone_repo":
      return {
        action,
        title: "Clone a repository?",
        detail: `The assistant wants to clone ${String(a.url ?? "a repository")} — you'll choose where, then it opens.`,
        confirmLabel: "Choose folder & clone",
      };
    case "switch_project":
      return {
        action,
        title: "Switch project?",
        detail: `The assistant wants to switch the IDE to ${String(a.name ?? a.path ?? "another project")}.`,
        confirmLabel: "Switch",
      };
    default:
      return null;
  }
}

/**
 * Wires the IDE renderer to the VortSpec IDE MCP bridge:
 *  - fetches the `--mcp-config` path (starts the bridge on first call);
 *  - mirrors editor state to the bridge so Claude's `get_*` tools can read it;
 *  - runs the actions Claude requests — `open_file` immediately, and the
 *    workspace-changing ones only after the user confirms.
 */
export function useIdeMcp(opts: {
  state: IdeState;
  onOpenFile: (path: string, startLine?: number, endLine?: number) => void;
  onOpenWorkspace: (project: Project) => void;
}): {
  configPath: string | undefined;
  pending: PendingIdeAction | null;
  confirm: () => void;
  cancel: () => void;
} {
  const [configPath, setConfigPath] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<PendingIdeAction | null>(null);

  const onOpenFileRef = useRef(opts.onOpenFile);
  onOpenFileRef.current = opts.onOpenFile;
  const onOpenWorkspaceRef = useRef(opts.onOpenWorkspace);
  onOpenWorkspaceRef.current = opts.onOpenWorkspace;

  const workspaceRoot = opts.state.workspaceRoot;

  // Start the bridge (once a workspace is open) and get the config path.
  useEffect(() => {
    if (!workspaceRoot) {
      setConfigPath(undefined);
      return;
    }
    let alive = true;
    void api
      .ideMcpConfigPath(workspaceRoot)
      .then((r) => {
        if (alive) setConfigPath(r?.path ?? undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [workspaceRoot]);

  // Keep the bridge's read cache fresh.
  const stateKey = JSON.stringify(opts.state);
  useEffect(() => {
    void api.reportIdeState(opts.state).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  // Perform an approved (or auto) action and reply to the bridge.
  const run = useCallback(async (action: IdeAction): Promise<void> => {
    const a = action.args ?? {};
    let result: { ok: boolean; message: string };
    try {
      if (action.tool === "open_file") {
        const path = String(a.path ?? "");
        onOpenFileRef.current(
          path,
          typeof a.startLine === "number" ? a.startLine : undefined,
          typeof a.endLine === "number" ? a.endLine : undefined,
        );
        result = { ok: Boolean(path), message: path ? `Opened ${path} in the editor.` : "No path was given." };
      } else if (action.tool === "open_folder") {
        const project = a.path ? await api.refreshProject(String(a.path)) : await api.pickFolder();
        if (!project) result = { ok: false, message: "No folder was chosen." };
        else {
          onOpenWorkspaceRef.current(project);
          result = { ok: true, message: `Opened ${project.name} as the workspace.` };
        }
      } else if (action.tool === "clone_repo") {
        const dest = await api.pickFolder(true);
        if (!dest) result = { ok: false, message: "No destination folder was chosen." };
        else {
          const imported = await api.gitImport({ projectPath: dest.path, url: String(a.url ?? "") });
          if (!imported.ok) result = { ok: false, message: imported.message };
          else {
            const project = await api.refreshProject(dest.path);
            onOpenWorkspaceRef.current(project);
            result = { ok: true, message: `Cloned into ${project.name} and opened it.` };
          }
        }
      } else if (action.tool === "switch_project") {
        const projects = await api.listProjects();
        const match = projects.find(
          (p) => p.path === a.path || p.name === a.name || p.name === a.path,
        );
        if (!match) result = { ok: false, message: "That project isn't in your recents." };
        else {
          onOpenWorkspaceRef.current(match);
          result = { ok: true, message: `Switched to ${match.name}.` };
        }
      } else {
        result = { ok: false, message: `Unsupported IDE action: ${action.tool}.` };
      }
    } catch (err) {
      result = { ok: false, message: `The IDE hit an error: ${(err as Error).message}` };
    }
    void api.resolveIdeAction({ requestId: action.requestId, ...result });
  }, []);

  // Subscribe to actions Claude requests.
  useEffect(() => {
    const off = api.onIdeMcpAction((action) => {
      const gated = describe(action);
      if (gated) setPending(gated);
      else void run(action);
    });
    return off;
  }, [run]);

  const confirm = useCallback(() => {
    if (!pending) return;
    const action = pending.action;
    setPending(null);
    void run(action);
  }, [pending, run]);

  const cancel = useCallback(() => {
    if (!pending) return;
    void api.resolveIdeAction({
      requestId: pending.action.requestId,
      ok: false,
      message: "The user declined the action.",
    });
    setPending(null);
  }, [pending]);

  return { configPath, pending, confirm, cancel };
}
