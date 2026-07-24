import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Project, EnvCheck } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button } from "./ui";
import { figmaMcpBlocking } from "../lib/figma-mcp-gate";

/**
 * Project-scoped Figma-MCP gate (change: figma-mcp-prerequisite, task 2.3).
 *
 * For a project whose design source is Figma, the Figma MCP is required — when it
 * isn't connected, surface a blocking banner with a one-click set-up (runs
 * `claude mcp add … figma …`). Since MCP OAuth is interactive, a configured-but-
 * unauthed server shows an "authenticate then re-check" affordance. Renders
 * nothing for non-Figma projects or once the MCP is connected.
 */
export function FigmaMcpBanner({ project }: { project: Project }): JSX.Element | null {
  const [designSource, setDesignSource] = useState<string | null>(null);
  const [mcp, setMcp] = useState<EnvCheck | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const [cfg, m] = await Promise.all([
      api.projectConfig(project.path).catch(() => null),
      api.verifyFigmaMcp().catch(() => null),
    ]);
    setDesignSource(cfg?.designSource ?? null);
    setMcp(m ?? null);
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  if (!figmaMcpBlocking(designSource, mcp?.status)) return null;

  // Configured but unauthenticated → the user completes OAuth (`/mcp → Authenticate`);
  // otherwise it's simply not added yet → we run the install.
  const needsAuth = mcp?.status === "fail";

  async function setUp(): Promise<void> {
    setBusy(true);
    try {
      setMcp((await api.addFigmaMcp().catch(() => null)) ?? mcp);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="figma-mcp-gate"
      className="flex flex-none items-start gap-3 border-b border-vs-warning/40 bg-vs-warning/10 px-5 py-2.5 text-[12px]"
    >
      <span className="text-vs-warning">⚠</span>
      <div className="min-w-0 flex-1 leading-relaxed text-vs-text-primary">
        This project's design source is <b>Figma</b>, but the <b>Figma MCP</b>{" "}
        {needsAuth ? "needs authentication" : "isn't set up"} — Claude can't read your design system until it's
        connected.
        {needsAuth && (
          <>
            {" "}
            In the terminal, run <code className="font-mono">/mcp</code> → <b>Authenticate</b>, then re-check.
          </>
        )}
      </div>
      <Button
        variant="primary"
        disabled={busy}
        onClick={() => void (needsAuth ? refresh() : setUp())}
      >
        {busy ? "Setting up…" : needsAuth ? "Re-check" : "Set up Figma MCP"}
      </Button>
    </div>
  );
}
