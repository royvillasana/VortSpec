## Context

VortSpec has a working ZIP import pipeline (M0+M1+M2). The next import source is Figma. The Figma MCP tools in the Claude Code environment are NOT available to the web app runtime — they only work within the AI assistant session. The web app needs its own Figma connection via the **Figma REST API** with a Personal Access Token (PAT).

The PRD anticipated this: *"Figma OAuth app review timeline; fallback for beta is personal access token input."*

## Goals / Non-Goals

**Goals:**
- User provides their Figma PAT in project settings (one-time)
- User pastes a Figma file URL → VortSpec calls Figma REST API → produces tokens + components in DB
- Figma variables → DesignTokens with `confidence: 'confirmed'`
- Figma component sets → ComponentIR with real variant axes
- Same Inspector experience as ZIP import

**Non-Goals:**
- Figma OAuth (requires app review — use PAT for beta)
- Real-time sync / write-back to Figma
- Figma plugin development

## Decisions

### 1. Figma REST API with Personal Access Token

The user generates a PAT at `figma.com/developers/api#access-tokens` (free, takes 30 seconds). The PAT is stored in the `project_ai_keys` table with `provider: 'figma'`. The app calls the Figma REST API directly.

**Key endpoints:**
```
GET /v1/files/:key                     → file structure, document tree
GET /v1/files/:key/variables/local     → local variables (tokens)
GET /v1/files/:key/variables/published → published variables
GET /v1/files/:key/components          → published components
GET /v1/files/:key/component_sets      → component sets (variants)
GET /v1/files/:key/styles              → text/color/effect styles
GET /v1/files/:key/nodes?ids=1:2,3:4   → specific node details with styles
```

**Auth:** `X-Figma-Token: <PAT>` header on all requests.

**Rationale:** Simplest approach, no OAuth complexity, no MCP dependency. The PAT gives read access to all files the user can see. The PRD explicitly allows this for beta.

### 2. Four-stage import pipeline

Runs as an Inngest job (same pattern as ZIP import) with stages:

1. **Discover** — `GET /v1/files/:key` to get the document tree. List pages, find component and component set nodes.
2. **Extract Variables** — `GET /v1/files/:key/variables/local` + `/published`. Map to DesignTokens with `confidence: 'confirmed'`.
3. **Extract Components** — `GET /v1/files/:key/nodes?ids=...` for each component/component set. Extract styles, auto-layout, variant properties, text content.
4. **Report** — Compute CompletenessReport, persist tokens + components to DB.

### 3. Confidence mapping from Figma

| Figma source | VortSpec confidence | Rationale |
|---|---|---|
| Variables (bound) | `confirmed` | Explicit token by the designer |
| Component set variant properties | `confirmed` | Explicit variant axis |
| Named styles (text, color, effect) | `confirmed` | Explicit design decisions |
| Raw fills/colors not bound to variables | `inferred` | Could be one-offs or candidates |
| Auto-layout properties | `confirmed` | Explicit layout intent |
| Inferred props from layer names | `inferred` | Naming convention, not explicit |

### 4. Inngest job (same as ZIP)

The Figma import runs as an Inngest function triggered by `figma-import/started` event. This keeps the architecture consistent with ZIP import and provides the same progress polling UX. Each stage updates `stage_states` in the imports table.

### 5. PAT storage

Store the Figma PAT in the existing `project_ai_keys` table:
- `provider: 'figma'`
- `encrypted_key: <PAT>` (for now, plain text in dev; proper encryption is a phase 2 concern per PRD)
- `fingerprint: 'figt_****'` (masked for display)

### 6. Rate limiting

Figma REST API has a rate limit of ~30 requests/minute. The adapter SHALL:
- Batch node requests using the `ids` query parameter (up to 50 nodes per call)
- Add a 2-second delay between batches
- Retry on 429 with exponential backoff

## Risks / Trade-offs

- **PAT security** — PATs have full read access. Mitigation: store encrypted, never return to client, warn user in UI.
- **Variable API availability** — Only available on certain Figma plans. Mitigation: graceful fallback to fill mining.
- **Large files** — 200+ components need pagination. Mitigation: batch `nodes` endpoint, progress per batch.
- **Rate limits** — 30 req/min limit. Mitigation: batching + delays. A 50-component file needs ~3 requests.
