// VortSpec IDE MCP server — a generic stdio↔bridge forwarder.
//
// Claude Code spawns this (via `--mcp-config`) as its own child and speaks MCP
// over stdio (newline-delimited JSON-RPC 2.0). This process owns NO IDE logic:
// it connects to the VortSpec main-process bridge over a local unix socket
// (endpoint + token from env), pulls the tool catalog from the bridge, and
// forwards each `tools/call` to it. All editor reads and gated actions happen in
// the main process; keeping this a dumb pipe means one source of truth (the
// bridge's catalog) and nothing here to drift.
//
// Node built-ins only — it runs under the Electron binary with
// ELECTRON_RUN_AS_NODE=1 (or plain `node`), so it must not import anything that
// needs bundling.
import net from "node:net";
import readline from "node:readline";

const ENDPOINT = process.env.VORTSPEC_IDE_ENDPOINT || "";
const TOKEN = process.env.VORTSPEC_IDE_TOKEN || "";
const PROTOCOL_VERSION = "2024-11-05";

function out(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

let sock = null;
let bridgeBuf = "";
let catalog = [];
let nextId = 1;
const pending = new Map();

function connectBridge() {
  return new Promise((resolve, reject) => {
    if (!ENDPOINT) {
      reject(new Error("no bridge endpoint"));
      return;
    }
    const s = net.createConnection(ENDPOINT, () => {
      s.write(JSON.stringify({ type: "hello", token: TOKEN }) + "\n");
    });
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      bridgeBuf += chunk;
      let i = bridgeBuf.indexOf("\n");
      while (i >= 0) {
        const line = bridgeBuf.slice(0, i);
        bridgeBuf = bridgeBuf.slice(i + 1);
        if (line.trim()) {
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            i = bridgeBuf.indexOf("\n");
            continue;
          }
          if (msg.type === "welcome") {
            catalog = Array.isArray(msg.catalog) ? msg.catalog : [];
            resolve();
          } else if (msg.type === "denied") {
            reject(new Error(msg.message || "bridge denied the connection"));
          } else if (msg.type === "result") {
            const p = pending.get(msg.id);
            if (p) {
              pending.delete(msg.id);
              p(msg);
            }
          }
        }
        i = bridgeBuf.indexOf("\n");
      }
    });
    s.on("error", (e) => reject(e));
    s.on("close", () => {
      for (const p of pending.values()) p({ ok: false, message: "The IDE connection closed." });
      pending.clear();
    });
    sock = s;
  });
}

function callBridge(tool, args) {
  return new Promise((resolve) => {
    if (!sock || sock.destroyed) {
      resolve({ ok: false, message: "The IDE is not connected." });
      return;
    }
    const id = nextId++;
    pending.set(id, resolve);
    sock.write(JSON.stringify({ type: "call", id, tool, args }) + "\n");
  });
}

// Connect once; tools/list and tools/call await this before answering.
const ready = connectBridge().catch(() => undefined);

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  void handle(msg);
});

async function handle(msg) {
  const { id, method } = msg;
  if (method === "initialize") {
    out({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "vortspec-ide", version: "0.1.0" },
      },
    });
    return;
  }
  if (method === "tools/list") {
    await ready;
    out({
      jsonrpc: "2.0",
      id,
      result: {
        tools: catalog.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      },
    });
    return;
  }
  if (method === "tools/call") {
    await ready;
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const res = await callBridge(name, args);
    const ok = Boolean(res && res.ok);
    const text = (res && res.message) || (ok ? "Done." : "The IDE could not complete that action.");
    out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: !ok } });
    return;
  }
  // Any other request with an id gets an empty ack; notifications are ignored.
  if (id !== undefined && method) out({ jsonrpc: "2.0", id, result: {} });
}
