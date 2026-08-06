# The live-Playground relay

A small [Hocuspocus](https://tiptap.dev/docs/hocuspocus) server that lets two or more people edit the same light page in the Playground at once — shared cursors, live edits, a participant count.

**VortSpec does not run this for you, and it is not shipped inside the app.** A team runs it themselves, the same way they bring their own Claude and their own GitHub. A project with no relay configured behaves exactly as it does today: no connection is attempted, and nothing is blocked.

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

## Deploying it

Hocuspocus runs on Node, Bun, Deno, and Cloudflare Workers. Anything that can hold a WebSocket open works. In practice you need:

- **TLS**, if it is reachable over the internet — put it behind a reverse proxy that terminates it. A `ws://` connection from a packaged app over a hostile network is not something to rely on.
- **A stable hostname**, since it goes in project configuration.
- **WebSocket support end to end.** The most common deployment failure is a proxy or load balancer that quietly downgrades or drops the upgrade, which looks like "collaboration silently doesn't work" rather than an error.

## Persistence

This server keeps documents in memory only. That is deliberate: the durable copy of a page is the file in your repository, committed and pushed like everything else. A restart drops in-flight session state, so anything not yet saved to the project is lost — the Playground is responsible for making that visible.

If you want the relay to survive restarts, Hocuspocus has a database extension. Note what that changes: the server stops being a pipe and becomes a place your content is stored.
