# The live-Playground relay

A small [Hocuspocus](https://tiptap.dev/docs/hocuspocus) server that lets two or more people edit the same light page in the Playground at once — shared cursors, live edits, a participant count.

**VortSpec does not run this for you, and it is not shipped inside the app.** A team runs it themselves, the same way they bring their own Claude and their own GitHub. A project with no relay configured behaves exactly as it does today: no connection is attempted, and nothing is blocked.

## What this changes about "local-first"

VortSpec's pitch is that it runs nothing: your own Claude, your own GitHub, your project as plain
files on disk. A live session is the one exception, and it is worth stating rather than glossing.

Live collaboration needs an always-on connection between people, which git cannot provide. So the
shape stays the same — the relay is **yours**, the way your Claude and your GitHub are — but a
project with a relay configured does hold an open outbound WebSocket while a light page is open.

What has NOT changed:

- A project with no relay configured connects to **nothing**. There is no default host anywhere in
  the app; the address only exists if somebody put it in `.vortspec/collab.json`.
- Your files stay where they were. The durable copy of a page is still the file in your repository,
  and the relay keeps nothing after a restart.
- Losing the relay costs collaboration, never your work. Edits keep applying and keep saving.

## Read this first

**The relay can read what it relays.** Yjs updates through Hocuspocus are not end-to-end encrypted, so whoever operates this server can read the content of every page synced through it.

That is fine when your team runs it — it is no more than your git host already holds. It is **not** fine on a machine administered by someone who should not see the work. Decide which of those you are doing before you deploy it.

Room ids are hashes of "repository + page", so this server never receives repository URLs and its logs do not accumulate a record of who is working on what.

## Running it

```bash
pnpm --filter @vortspec/relay start          # :1234
PORT=8080 pnpm --filter @vortspec/relay start
```

Then point the project at it (see the app's collaboration settings).

## Authentication

`RELAY_SECRET` requires every client to present a shared secret:

```bash
RELAY_SECRET=$(openssl rand -hex 32) pnpm --filter @vortspec/relay start
```

Without it the server is **open**: anyone who can reach it and knows a room id can join that room. Room ids are unguessable in practice, but that is obscurity rather than authorization, and the server says so at startup rather than pretending otherwise.

The better answer, not built yet, is to validate against the git host so that access to the repository *is* access to the session — one source of truth instead of a second secret to distribute and rotate.

## When a session will not go live on a new network

Check the network before debugging the app:

```bash
node tools/relay/wstest.mjs wss://your-relay.example.com
```

`OPEN` means the network allows the upgrade and any remaining problem is in the app or the room.
`TIMEOUT` means something in between accepted the connection and ate the upgrade — a corporate proxy
stripping `Upgrade` is the usual culprit, and no amount of app-side logging can see it: from inside
the app that is indistinguishable from a relay that is merely slow, because it says "connecting"
either way.

## A tunnel, for testing without deploying

`cloudflared` gives a public HTTPS/WSS address with no account:

```bash
cloudflared tunnel --url http://localhost:1234
# → https://<random>.trycloudflare.com   (use its wss:// form as the relay address)
```

Good enough to test two real machines over the real internet. Not for ongoing use: the address
changes every restart, and the relay address is committed to the project, so a new address means a
new commit.

## Deploying it

Hocuspocus runs on Node, Bun, Deno, and Cloudflare Workers. Anything that can hold a WebSocket open works. In practice you need:

- **TLS**, if it is reachable over the internet — put it behind a reverse proxy that terminates it. A `ws://` connection from a packaged app over a hostile network is not something to rely on.
- **A stable hostname**, since it goes in project configuration.
- **WebSocket support end to end.** The most common deployment failure is a proxy or load balancer that quietly downgrades or drops the upgrade, which looks like "collaboration silently doesn't work" rather than an error.

## Reading the log

```
+ vs-cbf9…        a client joined that room
- vs-cbf9… (1)    a client left; how many remain
~ vs-cbf9… — 2 client(s), 3 top-level node(s)
```

The node count is the useful one. **A light page has exactly three top-level nodes** — the doctype, a
newline, and `<html>` — so anything else means the room is holding more than one copy of the page.
That happens if two clients each seed it from their own file, and the symptom is not what you would
guess: everything reports connected and healthy while each person edits a different copy and no edit
ever crosses. The relay warns when it sees it, because from inside the app that failure is invisible.

## Persistence

This server keeps documents in memory only. That is deliberate: the durable copy of a page is the file in your repository, committed and pushed like everything else. A restart drops in-flight session state, so anything not yet saved to the project is lost — the Playground is responsible for making that visible.

If you want the relay to survive restarts, Hocuspocus has a database extension. Note what that changes: the server stops being a pipe and becomes a place your content is stored.
