import { useState } from "react";
import type { JSX } from "react";
import type { FigmaHealth, FigmaHealthMode, Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
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

export function FigmaHealthCheck({ project }: { project: Project }): JSX.Element {
  const [health, setHealth] = useState<FigmaHealth | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    try {
      setHealth(await api.checkFigmaHealth({ projectPath: project.path }));
    } finally {
      setBusy(false);
    }
  }

  const tone = health ? TONE[health.mode] : null;
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
