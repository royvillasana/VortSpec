# Figma connection & design-system extraction

How VortSpec reads a Figma design source, why it broke, and the reliability
machinery added to fix it. VortSpec **never calls the Figma API directly** and
**stores no Figma token** — the user's own Claude Code (the engine) does the
reading through their own MCP servers; VortSpec configures, validates, and gates.

## Three read paths

| Path | Transport | Auth | Needs | Notes |
|---|---|---|---|---|
| **Remote Figma MCP** (recommended) | `mcp.figma.com` (HTTP) | **OAuth** | just a file link | No token, no plugin, no live selection. Most reliable. |
| **figma-cli** | local CLI (`~/figma-cli`) | none (drives Figma Desktop) | Figma Desktop running; yolo needs macOS App Management | VortSpec's own reader for the Tokens Inspector sync/reconcile. `figma-cli.ts`. |
| **figma-console Desktop Bridge** | local MCP (`figma-console-mcp`) | **personal access token** (`FIGMA_ACCESS_TOKEN`) | the Desktop Bridge plugin running + file focused | Reads the full variable collection in bulk, but the token expires (403) and the plugin must be open. |

The foundation **scan** (the engine extracting tokens + detecting components)
runs through the **MCP** path. The extraction prompts now **prefer the remote
Figma MCP** (OAuth) and explicitly do **not** depend on the Desktop Bridge — see
`design-system` stage `promptTemplate` (`shared/flow.ts`) and `RESCAN_PROMPT`
(`shared/sdd-prompts.ts`).

## What went wrong (the failure this fixes)

A scan with an **expired token** + a **closed Desktop Bridge** couldn't read the
variable collection, so extraction **silently degraded to guessing** token values
from a few visible instances — producing a partial `tokens.css` and wrong colors
(e.g. warning rendered orange instead of the Figma yellow). The old
`verifyFigmaMcp` (`claude mcp list`) reported "connected" at the transport level
even though variable reads would fail — so nothing surfaced the degradation.

## Connection health check

`main/figma/figma-health.ts` — `checkFigmaHealth()` runs a **read-only** scoped
`claude -p` diagnostic (routed to Sonnet) that uses the user's Figma MCP to
attempt a **file-level** read of variables **and** styles (no live selection),
then classifies the outcome:

- `ok` — variables + styles readable, safe to scan
- `token-expired` — Figma REST returned 401/403 → refresh the token
- `bridge-down` — the Desktop Bridge isn't reachable → open it, or use the remote MCP
- `no-variables` / `not-configured` / `unknown`

Pure, tested helpers: `classifyFigmaHealth`, `extractVerdict`, `figmaHealthPrompt`.
IPC `figma:checkHealth`. UI: `packages/ui/src/components/FigmaHealthCheck.tsx`,
surfaced in the Foundation when the source is Figma — so a broken connection is
caught **before** a scan wastes a run on guessed tokens.

## Token management (Settings → Figma API token)

`main/figma/figma-token.ts` — write-through only, **no VortSpec-side storage**
(invariant #4):

- `getFigmaTokenStatus()` reports **presence only** — never the value.
- `setFigmaToken(token)` writes the user-supplied token into the `figma-console`
  MCP's `FIGMA_ACCESS_TOKEN` env via the supported CLI (`claude mcp remove` →
  `add-json`), preserving the rest of the server spec; restores the previous spec
  on failure.

IPC `figma:tokenStatus` / `figma:setToken`. UI: the `FigmaTokenSettings` card in
`Profile.tsx` (masked input, never echoes a stored token).

## Variant-aware, public-only detection

The detected inventory (`.sdd-de/components.json`) gained a `variants` axis field
(`detectedComponentSchema` in `shared/flow.ts`; mirrored on `InspectorComponent`).
Both extraction prompts now instruct the engine to:

- **Collapse variants** — a Figma `COMPONENT_SET`, or a slash-named family
  (`form-item/horizontal/input`, `form-item/vertical/select`, …), becomes **one**
  entry named after the base with its variant **axes** in `variants`
  (`{ "name": "form-item", "variants": ["orientation", "control"] }`), not one row
  per variant.
- **Exclude internal sub-components + styles** — drop `_`-prefixed private parts,
  `.`-prefixed styles (they belong in the token file), and nodes used only inside
  one other component (fold `navbar-brand` into `navbar`, `carousel-item` into
  `carousel`, …). Judge by **composition**, not the `components/` folder prefix.
- **Never fabricate** a value that can't be read — omit and note it instead.
- **Prefer the remote Figma MCP**, fetching variables + styles (not code).

The reader (`main/inspector/component-reader.ts`) surfaces `variants` into the
roster, where `ComponentRow` shows a `⎇ axis · axis` badge (`GuidedFlow.tsx`).
Build prompts (`buildOnePrompt`, `buildChunkPrompt`) implement a collapsed set as
a **single** component covering all variants (CVA props).

## Related

- User-facing guide: the **Figma connection** section of [`site/guide.html`](../site/guide.html).
- Storybook preview errors (a sibling reliability fix): `main/workspace/dev-server.ts` `serverExitMessage`.
