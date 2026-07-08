import { useEffect, useRef } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { api } from "../lib/api";

/**
 * The integrated terminal — an xterm.js front end over a real PTY in the main
 * process (see core's pty-manager). Shared by both app shells. The session is
 * scoped to the workspace folder; keystrokes are relayed to the PTY, output is
 * streamed back, and the PTY resizes with the viewport. The session is killed
 * when the component unmounts.
 */
export function Terminal({ project }: { project: Project }): JSX.Element {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const id = crypto.randomUUID();

    const term = new XTerm({
      fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
      fontSize: 12,
      cursorBlink: true,
      convertEol: true,
      theme: {
        background: "#08090B",
        foreground: "#E7E9EC",
        cursor: "#7C6FF0",
        selectionBackground: "rgba(124, 111, 240, 0.25)",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    try {
      fit.fit();
    } catch {
      // element not laid out yet — the ResizeObserver below will fit shortly.
    }

    void api.terminalCreate({ id, projectPath: project.path, cols: term.cols, rows: term.rows });

    const offData = api.onTerminalData((p) => {
      if (p.id !== id) return;
      if (p.data) term.write(p.data);
      if (p.exit !== undefined && p.exit !== null) {
        term.write(`\r\n\x1b[90m[process exited (${p.exit})]\x1b[0m\r\n`);
      }
    });
    const input = term.onData((data) => void api.terminalWrite(id, data));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        void api.terminalResize(id, term.cols, term.rows);
      } catch {
        // ignore transient layout errors
      }
    });
    ro.observe(el);

    return () => {
      offData();
      input.dispose();
      ro.disconnect();
      void api.terminalKill(id);
      term.dispose();
    };
  }, [project.path]);

  return <div ref={elRef} data-testid="terminal" className="h-full w-full bg-vs-bg-code p-1" />;
}
