#!/usr/bin/env bash
# Put the relay on the internet and tell the project where it is — one command.
#
#   ./tools/relay/share.sh "/path/to/the/project"
#
# Starts the relay, opens a Cloudflare quick tunnel, writes the tunnel's address into the project's
# .vortspec/collab.json, and commits and pushes it so anyone who clones gets the address.
#
# Why a script rather than a list of steps: a quick tunnel's address is RANDOM and changes every time
# it starts, and that address is committed to the project. So every restart is a new URL and a new
# commit, and doing that by hand at the start of a session — with somebody waiting — is how people
# end up connected to a relay that stopped existing yesterday.
#
# Keep this running. Both the relay and the tunnel live for as long as this process does; closing it
# takes the session offline and invalidates the committed address.
set -euo pipefail

PROJECT="${1:?usage: share.sh <path-to-project>}"
PORT="${PORT:-1234}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v cloudflared >/dev/null || { echo "cloudflared not found — brew install cloudflared"; exit 1; }
[ -d "$PROJECT/.vortspec" ] || { echo "no .vortspec in $PROJECT — is that a VortSpec project?"; exit 1; }

cleanup() { [ -n "${RELAY_PID:-}" ] && kill "$RELAY_PID" 2>/dev/null || true; }
trap cleanup EXIT

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "▸ relay already listening on :$PORT"
else
  node "$HERE/server.mjs" >/tmp/vortspec-relay.log 2>&1 &
  RELAY_PID=$!
  sleep 2
  lsof -ti:"$PORT" >/dev/null 2>&1 || { echo "relay failed to start — see /tmp/vortspec-relay.log"; exit 1; }
  echo "▸ relay on :$PORT (log: /tmp/vortspec-relay.log)"
fi

echo "▸ opening a tunnel…"
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >/tmp/vortspec-tunnel.log 2>&1 &
for _ in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/vortspec-tunnel.log 2>/dev/null | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "${URL:-}" ] || { echo "the tunnel did not come up — see /tmp/vortspec-tunnel.log"; exit 1; }

WSS="${URL/https:/wss:}"
echo "▸ tunnel: $WSS"

# Prove the upgrade works before telling anyone to rely on it. A tunnel that serves HTTP but not
# WebSockets looks fine right up until the moment somebody tries to collaborate through it.
node "$HERE/wstest.mjs" "$WSS" || { echo "the tunnel is up but WebSockets do not pass through it"; exit 1; }

printf '{\n  "relayUrl": "%s"\n}\n' "$WSS" > "$PROJECT/.vortspec/collab.json"
if git -C "$PROJECT" diff --quiet -- .vortspec/collab.json; then
  echo "▸ project already pointed here"
else
  git -C "$PROJECT" add .vortspec/collab.json
  git -C "$PROJECT" commit -q -m "Point at the relay for this session"
  git -C "$PROJECT" push -q && echo "▸ pushed — a fresh clone now gets this address"
fi

echo
echo "Ready. Anyone who clones the project and opens a light page joins the session."
echo "Leave this running; closing it takes the relay offline and the address stops working."
echo
wait
