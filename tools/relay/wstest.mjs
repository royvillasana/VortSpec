/**
 * Does a WebSocket actually reach the relay from HERE? (live-playground, task 2.8)
 *
 *   node tools/relay/wstest.mjs wss://your-relay.example.com
 *
 * Run this first when a session will not go live on a new network. The app cannot tell you what this
 * tells you: a corporate proxy that strips the `Upgrade` header, or TLS interception, produces a
 * connection that never becomes a WebSocket — and from inside the app that is indistinguishable from
 * a relay that is simply slow. It says "connecting" forever either way.
 *
 * OPEN     the network allows it; any remaining problem is in the app or the room
 * TIMEOUT  something between here and the relay accepted the connection and ate the upgrade
 * ERROR    DNS, TLS, or a refused connection — the message says which
 */
import { WebSocket } from "ws";

const url = process.argv[2];
if (!url) {
  console.error("usage: node wstest.mjs wss://relay.example.com");
  process.exit(2);
}

const ws = new WebSocket(url);
const started = Date.now();
const timer = setTimeout(() => {
  console.log("TIMEOUT — connected but never upgraded in 20s (a proxy is likely stripping it)");
  process.exit(1);
}, 20_000);

ws.on("open", () => {
  clearTimeout(timer);
  console.log(`OPEN — upgrade succeeded in ${Date.now() - started}ms`);
  process.exit(0);
});
ws.on("error", (e) => {
  clearTimeout(timer);
  console.log(`ERROR — ${e.message}`);
  process.exit(1);
});
