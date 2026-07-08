import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { FigmaConnection as FigmaStatus } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Card, Spinner } from "@vortspec/ui/ui";

/**
 * Figma connection setup. VortSpec's PRIMARY Figma link is the local figma-cli
 * (drives Figma Desktop directly, no token). This panel shows the live status
 * and walks the user through enabling yolo mode — including an automated action
 * that opens macOS System Settings to the exact App Management pane. The MCP
 * bridge + REST token remain automatic fallbacks when the CLI isn't connected.
 */
export function FigmaConnection(): JSX.Element {
  const [status, setStatus] = useState<FigmaStatus | null>(null);
  const [busy, setBusy] = useState<null | "yolo" | "safe" | "refresh">(null);

  async function refresh(kind: typeof busy = "refresh"): Promise<void> {
    setBusy(kind);
    try {
      setStatus(await api.figmaStatus());
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void refresh("refresh");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(mode: "yolo" | "safe"): Promise<void> {
    setBusy(mode);
    try {
      setStatus(await api.figmaConnect(mode));
    } finally {
      setBusy(null);
    }
  }

  const appName = status?.appName ?? "VortSpec";
  const connected = status?.connected ?? false;

  return (
    <Card className="max-w-2xl p-5">
      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-vs-text-primary">Figma connection</h2>
        {status && (
          <span
            className={`rounded px-2 py-0.5 text-[11px] ${
              connected
                ? "bg-vs-success-muted text-vs-success"
                : status.installed
                  ? "bg-vs-warning-muted text-vs-warning"
                  : "bg-vs-bg-elevated text-vs-text-muted"
            }`}
          >
            {connected
              ? `Connected${status.mode ? ` · ${status.mode} mode` : ""}`
              : status.installed
                ? "Not connected"
                : "Not installed"}
          </span>
        )}
        <div className="flex-1" />
        <Button variant="ghost" disabled={busy !== null} onClick={() => void refresh("refresh")}>
          {busy === "refresh" ? <Spinner /> : null}
          Refresh
        </Button>
      </div>

      <p className="mt-1 text-xs text-vs-text-muted">
        VortSpec connects to Figma through the local <span className="font-mono">figma-cli</span> — it
        drives Figma Desktop directly, no token. The Figma MCP bridge and REST token stay as automatic
        fallbacks.
      </p>

      {status === null ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-vs-text-muted">
          <Spinner /> Checking the connection…
        </div>
      ) : connected ? (
        <div className="mt-4 rounded-md border border-vs-success-border bg-vs-success-muted p-3 text-sm text-vs-text-primary">
          <p className="font-medium text-vs-success">{status.message}</p>
          {status.openFiles.length > 0 && (
            <p className="mt-1 text-xs text-vs-text-secondary">
              Open files: {status.openFiles.join(", ")}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          {/* Yolo mode — the fast, direct path (needs macOS App Management). */}
          <section className="rounded-md border border-vs-border-default p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-vs-text-primary">Yolo mode</span>
              <span className="rounded bg-vs-bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-vs-text-muted">
                fastest
              </span>
            </div>
            <p className="mt-1 text-xs text-vs-text-muted">
              Patches Figma Desktop for a direct connection (~10× faster). macOS requires{" "}
              <span className="text-vs-text-secondary">{appName}</span> to have App Management
              permission first.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-vs-text-secondary">
              <li>
                Open <span className="font-medium">System Settings → Privacy &amp; Security → App
                Management</span> and enable <span className="font-medium">{appName}</span>.
              </li>
              <li>
                Fully quit <span className="font-medium">{appName}</span> (⌘Q) and reopen it — macOS
                only reads the new permission after a restart.
              </li>
              <li>Come back here and connect.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="default" onClick={() => void api.figmaOpenAppManagement()}>
                Open App Management settings
              </Button>
              <Button variant="primary" disabled={busy !== null} onClick={() => void connect("yolo")}>
                {busy === "yolo" ? <Spinner /> : null}
                Connect (Yolo)
              </Button>
            </div>
          </section>

          {/* Safe mode — no OS permission, one-time plugin import. */}
          <section className="rounded-md border border-vs-border-default p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-vs-text-primary">Safe mode</span>
              <span className="rounded bg-vs-bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-vs-text-muted">
                no permission
              </span>
            </div>
            <p className="mt-1 text-xs text-vs-text-muted">
              Connects through a Figma plugin — no OS permission. After connecting, import the plugin
              once in Figma (Plugins → Development → Import from manifest) and run{" "}
              <span className="font-mono">FigCli</span>.
            </p>
            <div className="mt-3">
              <Button variant="default" disabled={busy !== null} onClick={() => void connect("safe")}>
                {busy === "safe" ? <Spinner /> : null}
                Connect (Safe)
              </Button>
            </div>
          </section>

          {!status.installed && (
            <p className="text-xs text-vs-text-muted">
              figma-cli isn't installed yet at{" "}
              <span className="font-mono">{status.cliDir}</span>. VortSpec will set it up during the
              guided setup.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
