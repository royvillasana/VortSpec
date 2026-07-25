#!/usr/bin/env bash
# One-command dev launch for the instant-Playground-edits feature (issue #56).
#
#   ./scripts/dev-instant-edits.sh
#
# It (1) builds the dev source-stamp bundle so the app's dev-server injection can find it,
# (2) scaffolds a stamped-ready Vite + React test project (idempotent), and (3) launches the
# VortSpec IDE in dev. Then, in the IDE: open the test project → Playground → select an element
# → edit it in the Design panel. A variant/text/delete edit persists to source in the BACKGROUND
# (no Apply, no AI); an element inside the list shows the withhold notice.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▸ [1/3] Building the source-stamp bundle (packages/core/resources/vortspec-stamp.mjs)…"
pnpm --filter @vortspec/core run build:stamp >/dev/null
# Point the dev-server's stamp resolver straight at the freshly built bundle — the most reliable
# candidate (the relative fallbacks work too, but this is layout-independent).
export VORTSPEC_STAMP_BUNDLE="$ROOT/packages/core/resources/vortspec-stamp.mjs"
echo "  ✓ bundle built → VORTSPEC_STAMP_BUNDLE=$VORTSPEC_STAMP_BUNDLE"

SAMPLE="${VORTSPEC_SAMPLE:-$HOME/Desktop/vortspec-instant-edits-sample}"
if [ ! -f "$SAMPLE/package.json" ]; then
  echo "▸ [2/3] Scaffolding a Vite + React test project at: $SAMPLE"
  mkdir -p "$SAMPLE/src"
  cat > "$SAMPLE/package.json" <<'JSON'
{
  "name": "vortspec-instant-edits-sample", "private": true, "type": "module",
  "scripts": { "dev": "vite" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.4", "vite": "^5.4.11", "typescript": "^5.5.4", "@types/react": "^18.3.1", "@types/react-dom": "^18.3.1" }
}
JSON
  cat > "$SAMPLE/vite.config.ts" <<'TS'
import react from "@vitejs/plugin-react";
export default { plugins: [react()] };
TS
  cat > "$SAMPLE/index.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>instant edits</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
HTML
  cat > "$SAMPLE/src/main.tsx" <<'TSX'
import { createRoot } from "react-dom/client";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(<App />);
TSX
  cat > "$SAMPLE/src/App.tsx" <<'TSX'
// A static tree (each element gets its own data-source → deterministic edits) plus a list
// (the mapped rows share one template anchor → the withhold/hand-off case).
const items = ["Alpha", "Beta", "Gamma"];

export function App() {
  return (
    <main className="page" style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1 className="title">Edit me instantly</h1>
      <button className="cta">Save</button>
      <ul className="list">
        {items.map((it) => (
          <li className="row" key={it}>{it}</li>
        ))}
      </ul>
    </main>
  );
}
TSX
  ( cd "$SAMPLE" && npm install --silent --no-audit --no-fund )
  echo "  ✓ project scaffolded + installed"
else
  echo "▸ [2/3] Test project already exists: $SAMPLE"
fi

echo "▸ [3/3] Launching VortSpec IDE (dev). In the IDE: open $SAMPLE → Playground."
exec pnpm --filter @vortspec/ide dev
