import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import serverSource from "./server.mjs?raw";
import {
  IDE_TOOLS,
  type BridgeClientMessage,
  type IdeMcpHost,
  type IdeTool,
} from "./protocol";

/**
 * IdeMcpBridge — the main-process side of the VortSpec IDE MCP integration.
 *
 * Since our assistant runs Claude headless (`claude -p`), the interactive
 * `--ide` WebSocket bridge is unavailable (verified: headless never connects).
 * Instead we ship a stdio MCP server via `--mcp-config`, which DOES load
 * headless. Claude spawns that server (`server.mjs`); it connects back here over
 * a local unix socket (per-run token) and forwards tool calls. The bridge owns
 * transport + auth + dispatch; the injected {@link IdeMcpHost} owns the actual
 * IDE reads and the confirmation-gated actions.
 *
 * Security: unix socket in the user's tmp dir (not a network port), chmod 0600,
 * a 256-bit per-instance token, and dispatch limited to the known catalog. No
 * keys are stored; state-changing tools are gated inside the host.
 */
export class IdeMcpBridge {
  private server: net.Server | null = null;
  private socketPath = "";
  private serverEntry = "";
  private mcpConfig = "";
  private readonly token = crypto.randomBytes(32).toString("hex");
  private readonly tmpFiles: string[] = [];

  constructor(private readonly host: IdeMcpHost) {}

  /** Start the socket server and materialise the spawnable server script. */
  async start(): Promise<void> {
    if (this.server) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vortspec-ide-"));
    this.socketPath = path.join(dir, "bridge.sock");
    this.serverEntry = path.join(dir, "server.mjs");
    fs.writeFileSync(this.serverEntry, serverSource, { mode: 0o600 });
    this.tmpFiles.push(this.serverEntry);

    const server = net.createServer((socket) => this.onConnection(socket));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.socketPath, () => {
        server.off("error", reject);
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch {
          // best-effort; the token still gates access
        }
        resolve();
      });
    });
  }

  private onConnection(socket: net.Socket): void {
    socket.setEncoding("utf8");
    let buf = "";
    let authed = false;
    const send = (msg: unknown): void => {
      socket.write(JSON.stringify(msg) + "\n");
    };
    socket.on("data", (chunk: string) => {
      buf += chunk;
      let i = buf.indexOf("\n");
      while (i >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) {
          let msg: BridgeClientMessage | null = null;
          try {
            msg = JSON.parse(line) as BridgeClientMessage;
          } catch {
            msg = null;
          }
          if (msg) void this.handle(msg, () => authed, (v) => (authed = v), send, socket);
        }
        i = buf.indexOf("\n");
      }
    });
    socket.on("error", () => undefined);
  }

  private async handle(
    msg: BridgeClientMessage,
    isAuthed: () => boolean,
    setAuthed: (v: boolean) => void,
    send: (msg: unknown) => void,
    socket: net.Socket,
  ): Promise<void> {
    if (msg.type === "hello") {
      // Constant-time token compare; reject anything that doesn't match.
      const ok =
        msg.token.length === this.token.length &&
        crypto.timingSafeEqual(Buffer.from(msg.token), Buffer.from(this.token));
      if (!ok) {
        send({ type: "denied", message: "bad token" });
        socket.destroy();
        return;
      }
      setAuthed(true);
      send({ type: "welcome", catalog: this.host.catalog() });
      return;
    }
    if (msg.type === "call") {
      if (!isAuthed()) {
        socket.destroy();
        return;
      }
      const known = this.host.catalog().some((t) => t.name === msg.tool);
      if (!known) {
        send({ type: "result", id: msg.id, ok: false, message: `Unknown IDE tool: ${msg.tool}.` });
        return;
      }
      try {
        const result = await this.host.invoke(msg.tool, msg.args ?? {});
        send({ type: "result", id: msg.id, ok: result.ok, message: result.message });
      } catch (err) {
        send({
          type: "result",
          id: msg.id,
          ok: false,
          message: `The IDE hit an error: ${(err as Error).message}`,
        });
      }
    }
  }

  /** Write (once) and return the `--mcp-config` file path for a run. */
  mcpConfigPath(): string {
    if (this.mcpConfig) return this.mcpConfig;
    const cfg = {
      mcpServers: {
        "vortspec-ide": {
          // Spawn under the Electron binary as plain Node so a runtime is always
          // present, packaged or not.
          command: process.execPath,
          args: [this.serverEntry],
          env: {
            ELECTRON_RUN_AS_NODE: "1",
            VORTSPEC_IDE_ENDPOINT: this.socketPath,
            VORTSPEC_IDE_TOKEN: this.token,
          },
        },
      },
    };
    this.mcpConfig = path.join(path.dirname(this.serverEntry), "mcp-config.json");
    fs.writeFileSync(this.mcpConfig, JSON.stringify(cfg), { mode: 0o600 });
    this.tmpFiles.push(this.mcpConfig);
    return this.mcpConfig;
  }

  /** The Claude Code allow-list group that enables our tools for a run. */
  static allowedToolGroup(): string {
    return "mcp__vortspec-ide";
  }

  catalog(): IdeTool[] {
    return this.host.catalog();
  }

  close(): void {
    this.server?.close();
    this.server = null;
    for (const f of [...this.tmpFiles, this.socketPath]) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
    this.tmpFiles.length = 0;
  }
}

/** Convenience: the default catalog, for hosts that expose every tool. */
export function defaultCatalog(): IdeTool[] {
  return IDE_TOOLS;
}
