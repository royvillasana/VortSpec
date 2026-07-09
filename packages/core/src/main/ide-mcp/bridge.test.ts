import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { IdeMcpBridge } from "./bridge";
import { IDE_TOOLS, type IdeMcpHost, type IdeToolResult } from "./protocol";

/**
 * Exercises the real vertical slice: the actual `server.mjs` (spawned exactly as
 * the `--mcp-config` would spawn it) ↔ the real socket bridge ↔ a stub host.
 * Proves the MCP handshake, catalog delivery, a read round-trip, and that a
 * state-changing tool is gated by the host (declined → isError).
 */

interface Call {
  tool: string;
  args: Record<string, unknown>;
}

function stubHost(behaviour: (c: Call) => IdeToolResult): { host: IdeMcpHost; calls: Call[] } {
  const calls: Call[] = [];
  const host: IdeMcpHost = {
    catalog: () => IDE_TOOLS,
    invoke: async (tool, args) => {
      const call = { tool, args };
      calls.push(call);
      return behaviour(call);
    },
  };
  return { host, calls };
}

/** A tiny MCP-over-stdio client for the spawned server. */
class McpClient {
  private buf = "";
  private nextId = 1;
  private readonly pending = new Map<number, (r: Record<string, unknown>) => void>();
  constructor(private readonly child: ChildProcess) {
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      this.buf += chunk;
      let i = this.buf.indexOf("\n");
      while (i >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        if (line.trim()) {
          const msg = JSON.parse(line) as { id?: number };
          if (typeof msg.id === "number" && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!(msg as Record<string, unknown>);
            this.pending.delete(msg.id);
          }
        }
        i = this.buf.indexOf("\n");
      }
    });
  }
  request(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 8000);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
}

let bridge: IdeMcpBridge | null = null;
let child: ChildProcess | null = null;

afterEach(() => {
  child?.kill("SIGKILL");
  child = null;
  bridge?.close();
  bridge = null;
});

async function launch(host: IdeMcpHost): Promise<McpClient> {
  bridge = new IdeMcpBridge(host);
  await bridge.start();
  const cfg = JSON.parse(readFileSync(bridge.mcpConfigPath(), "utf8")) as {
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
  };
  const entry = cfg.mcpServers["vortspec-ide"];
  child = spawn(entry.command, entry.args, {
    env: { ...process.env, ...entry.env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const client = new McpClient(child);
  const init = (await client.request("initialize", {})) as { result?: { serverInfo?: { name?: string } } };
  expect(init.result?.serverInfo?.name).toBe("vortspec-ide");
  return client;
}

describe("IdeMcpBridge + server.mjs", () => {
  it("delivers the catalog and round-trips a read tool", async () => {
    const { host, calls } = stubHost((c) =>
      c.tool === "get_workspace_folders"
        ? { ok: true, message: "Open folder: /Users/dev/acme" }
        : { ok: false, message: "unexpected" },
    );
    const client = await launch(host);

    const list = (await client.request("tools/list")) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const names = (list.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("get_workspace_folders");
    expect(names).toContain("open_folder");
    expect(names).toContain("clone_repo");

    const call = (await client.request("tools/call", { name: "get_workspace_folders", arguments: {} })) as {
      result?: { content?: Array<{ text: string }>; isError?: boolean };
    };
    expect(call.result?.isError).toBe(false);
    expect(call.result?.content?.[0]?.text).toContain("/Users/dev/acme");
    expect(calls).toEqual([{ tool: "get_workspace_folders", args: {} }]);
  });

  it("surfaces a host-gated (declined) state-changing tool as an error result", async () => {
    const { host, calls } = stubHost((c) =>
      c.tool === "open_folder"
        ? { ok: false, message: "The user declined opening that folder." }
        : { ok: true, message: "ok" },
    );
    const client = await launch(host);
    const call = (await client.request("tools/call", {
      name: "open_folder",
      arguments: { path: "/tmp/x" },
    })) as { result?: { content?: Array<{ text: string }>; isError?: boolean } };
    expect(call.result?.isError).toBe(true);
    expect(call.result?.content?.[0]?.text).toContain("declined");
    expect(calls[0]).toEqual({ tool: "open_folder", args: { path: "/tmp/x" } });
  });

  it("rejects an unknown tool without hitting the host", async () => {
    const { host, calls } = stubHost(() => ({ ok: true, message: "should not run" }));
    const client = await launch(host);
    const call = (await client.request("tools/call", { name: "rm_rf", arguments: {} })) as {
      result?: { content?: Array<{ text: string }>; isError?: boolean };
    };
    expect(call.result?.isError).toBe(true);
    expect(call.result?.content?.[0]?.text).toContain("Unknown IDE tool");
    expect(calls).toEqual([]);
  });
});
