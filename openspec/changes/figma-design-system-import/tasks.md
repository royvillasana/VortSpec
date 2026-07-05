## 1. Figma REST API Client

- [x] 1.1 Create `packages/adapters/figma/` with package.json (no new deps — uses native fetch), tsconfig
- [x] 1.2 Create `src/client.ts` — Figma REST API client with `X-Figma-Token` auth, rate limiting (2s between batches), retry on 429
- [x] 1.3 Create `parseFigmaUrl(url)` — extract fileKey from `/design/:key/...` and `/file/:key/...` URLs
- [x] 1.4 Create `getFile(pat, fileKey)` — `GET /v1/files/:key` → document tree with pages, nodes
- [x] 1.5 Create `getVariables(pat, fileKey)` — `GET /v1/files/:key/variables/local` + `/published` → raw variable data
- [x] 1.6 Create `getComponents(pat, fileKey)` — `GET /v1/files/:key/components` + `/component_sets` → component metadata
- [x] 1.7 Create `getNodes(pat, fileKey, nodeIds)` — `GET /v1/files/:key/nodes?ids=...` → detailed node data with styles (batched, max 50 per call)
- [x] 1.8 Create `getStyles(pat, fileKey)` — `GET /v1/files/:key/styles` → text/color/effect styles

## 2. Figma → IR Mapper

- [x] 2.1 Create `src/mapper.ts` — main mapping module
- [x] 2.2 `mapVariablesToTokens(variables)` — Figma variables → DesignToken[] with `confidence: 'confirmed'`, type mapped (COLOR→color, FLOAT→spacing/sizing)
- [x] 2.3 `mapComponentSetToIR(componentSet, nodes)` — component set → ComponentIR with variant axes from variant properties, `confidence: 'confirmed'`
- [x] 2.4 `mapNodeToIRNode(node)` — Figma node → IRNode with auto-layout → LayoutSpec, fills → styles
- [x] 2.5 `mapFillToStyleValue(fill)` — solid fills → `{kind:"literal", value:"#hex", flagged:true}`, variable-bound fills → `{kind:"token", tokenId}`
- [x] 2.6 `mapTextStylesToTokens(styles)` — text styles → typography DesignTokens with `confidence: 'confirmed'`
- [x] 2.7 `mapEffectStylesToTokens(styles)` — effect styles (shadows) → shadow DesignTokens
- [x] 2.8 `mineFills(document)` — walk entire document tree, extract unbound fills/effects as inferred candidates (fallback)
- [x] 2.9 Export barrel `src/index.ts`

## 3. Figma PAT Settings

- [x] 3.1 Add Figma PAT input to project settings (or import page): text input, save to `project_ai_keys` with `provider: 'figma'`
- [x] 3.2 Server action `saveFigmaPAT(projectId, pat)` — store in DB, show masked fingerprint
- [x] 3.3 Server function `getFigmaPAT(projectId)` — retrieve PAT for API calls

## 4. Inngest Pipeline for Figma Import

- [x] 4.1 Create `packages/pipeline/src/functions/figma-import.ts` — Inngest function `figma-import-pipeline` triggered by `figma-import/started`
- [x] 4.2 Stage 1: Discover — call `getFile`, list pages, find component/component_set nodes
- [x] 4.3 Stage 2: Extract Variables — call `getVariables`, map to tokens
- [x] 4.4 Stage 3: Extract Components — call `getNodes` (batched), map to ComponentIR
- [x] 4.5 Stage 4: Report — compute CompletenessReport, persist tokens + components to DB
- [x] 4.6 Update stage_states in imports table as each stage progresses
- [x] 4.7 Register the function in the Inngest serve route

## 5. Import UI Updates

- [x] 5.1 Update `NewImport.tsx` — add Figma URL input + "Import from Figma" button to the Figma card
- [x] 5.2 URL validation: must match `figma.com/design/` or `figma.com/file/` pattern
- [x] 5.3 Check for saved Figma PAT before starting — if missing, show PAT input inline
- [x] 5.4 Server action `startFigmaImport(projectId, figmaUrl)` — create source + import records, trigger Inngest event
- [x] 5.5 Update `ImportProgress.tsx` — show Figma-specific stage names (Discover, Extract Variables, Extract Components, Report)

## 6. Integration & Verification

- [x] 6.1 Test with a real Figma file URL — verify file structure read
- [x] 6.2 Test variables → confirmed tokens mapping
- [x] 6.3 Test component sets → variant axes mapping
- [x] 6.4 Test fallback when variables unavailable (free plan)
- [x] 6.5 Verify Inspector shows Figma-imported data correctly
- [x] 6.6 Verify `pnpm build && pnpm test` all green
