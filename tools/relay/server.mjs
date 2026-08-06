/**
 * The live-Playground relay (OpenSpec change: live-playground, task 2.1).
 *
 * This is NOT part of the VortSpec app and is never shipped inside it. VortSpec's whole shape is
 * "your own Claude, your own GitHub" — and live collaboration needs one thing git cannot provide, an
 * always-on connection between people. So the relay is a team's own: they run it, on their own
 * infrastructure, and a project with no relay configured behaves exactly as it does today.
 *
 * Read this before deploying it anywhere shared:
 *
 *   **The relay can read what it relays.** Yjs updates through Hocuspocus are not end-to-end
 *   encrypted. Whoever operates this server can read the content of every page synced through it.
 *   That is acceptable when the team runs it — it is no more than the git host already holds — and
 *   unacceptable if you put it on a box other people administer while assuming otherwise.
 *
 * Rooms are opaque by design: the client sends a hash of "repository + page", never the repository
 * URL, so this server's logs do not accumulate a list of who is working on what.
 *
 *   PORT=1234 pnpm --filter @vortspec/relay start
 */
import { Server } from "@hocuspocus/server";

const port = Number(process.env.PORT ?? 1234);

/**
 * Anything with a room id can currently join it, and a room id is a hash of a repository URL and a
 * page name — unguessable in practice, but that is obscurity, not authorization. Before this is
 * exposed beyond a trusted network it needs a real answer: a shared secret per team, or better,
 * validating the connection against the git host so that repository access IS session access.
 *
 * `RELAY_SECRET` is the interim: when set, a client must present it. When unset the server says so
 * loudly at startup rather than being quietly open.
 */
const secret = process.env.RELAY_SECRET ?? "";

const server = new Server({
  port,
  name: "vortspec-relay",

  async onAuthenticate({ token, documentName }) {
    if (!secret) return; // open — the banner below has already said so
    if (token !== secret) {
      throw new Error(`rejected a connection to ${documentName}`);
    }
  },

  async onConnect({ documentName }) {
    console.log(`+ ${documentName}`);
  },

  // TEMPORARY (diagnosing why edits do not cross): every document change the relay receives, with
  // who sent it and how big the room's document is. This distinguishes "the edit never left the
  // sender" from "it arrived and the receiver ignored it" — which no amount of app-side logging can,
  // because both sides look identical from inside one process.
  async onChange({ documentName, clientsCount, document }) {
    const size = document.getXmlFragment("page").length;
    console.log(`~ ${documentName} changed — ${clientsCount} client(s), page fragment has ${size} top-level node(s)`);
  },

  async onLoadDocument({ documentName }) {
    console.log(`? ${documentName} requested (relay has no copy yet — the first client will seed it)`);
  },

  async onDisconnect({ documentName, clientsCount }) {
    console.log(`- ${documentName} (${clientsCount} remaining)`);
  },
});

console.log(`vortspec relay on :${port}`);
console.log(
  secret
    ? "auth: shared secret required (RELAY_SECRET)"
    : "auth: NONE — anyone who knows a room id can join it. Set RELAY_SECRET before exposing this.",
);
console.log("note: this server can read the content of every page synced through it.");

await server.listen();
