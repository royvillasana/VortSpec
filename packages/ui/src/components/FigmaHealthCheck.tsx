import { useState } from "react";
import type { JSX } from "react";
import type { FigmaHealth, FigmaHealthMode, Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { useAssistantTask } from "../lib/assistant-task";
import { Button } from "./ui";

/**
 * Validates the Figma read path BEFORE the user re-runs the foundation scan. A
 * shallow "MCP connected" check isn't enough — the REST token can be expired
 * (403) or the Desktop Bridge can be closed, and the extraction then silently
 * degrades to guessing token values. This runs the read-only engine diagnostic
 * and shows exactly what to fix (refresh the token / open the Desktop Bridge).
 */
const TONE: Record<FigmaHealthMode, { cls: string; icon: string }> = {
  ok: { cls: "border-vs-success-border bg-vs-success-muted text-vs-success", icon: "✓" },
  "token-expired": { cls: "border-vs-error/40 bg-vs-error/[0.06] text-vs-error", icon: "⚠" },
  "bridge-down": { cls: "border-vs-warning-border bg-vs-warning-muted text-vs-warning", icon: "⚠" },
  "no-variables": { cls: "border-vs-warning-border bg-vs-warning-muted text-vs-warning", icon: "⚠" },
  "not-configured": { cls: "border-vs-border-default bg-vs-bg-surface text-vs-text-secondary", icon: "•" },
  unknown: { cls: "border-vs-border-default bg-vs-bg-surface text-vs-text-muted", icon: "?" },
};

/** Modes where the connection is broken and the assistant can help reconnect. */
const FIXABLE: FigmaHealthMode[] = ["token-expired", "bridge-down", "not-configured", "no-variables"];

/** The seed prompt handed to the sidebar assistant to reconnect Figma. It steers
 *  to the OAuth remote MCP and NEVER touches a personal access token (invariant #4). */
function figmaFixPrompt(h: FigmaHealth): string {
  return [
    "Help me reconnect this project's Figma design source so a foundation scan can read design variables and styles.",
    "",
    `A read-path health check reported: ${h.mode}. Detail: ${h.detail || "(none)"}.`,
    "",
    "Do this:",
    `1. Check whether the official remote Figma MCP is already configured (\`claude mcp list\`). If not, add it: \`${REMOTE_FIGMA_MCP_CMD}\`. This OAuth server needs no token, no Desktop Bridge, and no live selection.`,
    "2. Then tell me to run `/mcp` in Claude Code and Authenticate the `figma` server in the browser (this is an interactive step I do myself).",
    "3. After I confirm I've authenticated, verify by doing a file-level read of the variable collection AND styles through the remote MCP.",
    "",
    "HARD RULES: Never ask me for, generate, paste, or set a Figma personal access token or any API key — steer entirely to the OAuth server. Don't modify my design files. When the read works, tell me the connection is healthy and that I can go back and re-run the scan.",
  ].join("\n");
}

export function FigmaHealthCheck({ project }: { project: Project }): JSX.Element {
  const [health, setHealth] = useState<FigmaHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const dispatchTask = useAssistantTask();

  async function check(): Promise<void> {
    setBusy(true);
    setHandedOff(false);
    try {
      setHealth(await api.checkFigmaHealth({ projectPath: project.path }));
    } finally {
      setBusy(false);
    }
  }

  function fixInAssistant(h: FigmaHealth): void {
    dispatchTask?.({ title: "Fix: Figma connection", allowModify: true, prompt: figmaFixPrompt(h) });
    setHandedOff(true);
  }

  const tone = health ? TONE[health.mode] : null;
  const canFix = health ? FIXABLE.includes(health.mode) && dispatchTask !== null : false;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <Button variant="default" disabled={busy} onClick={() => void check()}>
          {busy ? "Checking Figma…" : "Check Figma connection"}
        </Button>
        <span className="text-[11px] text-vs-text-muted">
          {busy
            ? "Reading variables + styles through your Figma MCP…"
            : "Confirm your Figma MCP can read variables & styles before scanning."}
        </span>
      </div>
      {health && tone && (
        <div className={`flex gap-2.5 rounded-md border p-3 ${tone.cls.replace(/text-\S+/, "")}`}>
          <span className={`text-sm leading-none ${tone.cls.match(/text-\S+/)?.[0] ?? ""}`}>{tone.icon}</span>
          <div className="flex min-w-0 flex-col gap-1.5 text-[12px] leading-relaxed text-vs-text-primary">
            <span>{health.message}</span>
            {/* Hand the fix to the right-sidebar chat so it can reconnect while
                the user carries on elsewhere. Only in a host that has the dock. */}
            {canFix && (
              <div className="mt-0.5 flex items-center gap-2">
                <Button variant="primary" onClick={() => fixInAssistant(health)}>
                  Fix in the assistant →
                </Button>
                {handedOff && (
                  <span className="text-[11px] text-vs-text-muted">
                    Working in the assistant — you can keep using the app.
                  </span>
                )}
              </div>
            )}
            {/* When the legacy figma-console path is failing, recommend the OAuth MCP. */}
            {(health.mode === "token-expired" ||
              health.mode === "bridge-down" ||
              health.mode === "not-configured") && (
              <div className="mt-0.5 flex flex-col gap-1 rounded border border-vs-border-default bg-vs-bg-surface p-2">
                <span className="text-[11px] font-medium text-vs-text-secondary">
                  Recommended — the official Figma MCP (OAuth, no token or Desktop Bridge):
                </span>
                <code className="select-all break-all font-mono text-[11px] text-vs-text-primary">
                  {REMOTE_FIGMA_MCP_CMD}
                </code>
                <span className="text-[10px] text-vs-text-muted">
                  …then run <code className="text-vs-text-secondary">/mcp</code> in Claude Code and Authenticate.{" "}
                  <button
                    onClick={() =>
                      void api.openInstall(
                        "https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/",
                      )
                    }
                    className="text-vs-accent hover:underline"
                  >
                    Docs →
                  </button>
                </span>
              </div>
            )}
            {health.mode === "token-expired" && (
              <button
                onClick={() => void api.openInstall("https://www.figma.com/developers/api#access-tokens")}
                className="self-start text-[11px] text-vs-text-muted hover:text-vs-text-secondary"
              >
                Prefer to keep figma-console? How to create a Figma token →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The command that connects the recommended OAuth Figma MCP (kept in sync with core). */
const REMOTE_FIGMA_MCP_CMD = "claude mcp add --transport http figma https://mcp.figma.com/mcp";
