## Why

VortSpec currently only imports design systems from ZIP exports (HTML/CSS). The PRD's second import source is Figma — and Figma provides far higher fidelity than HTML/CSS scraping because it has **explicit semantics**: variables ARE tokens (confirmed, not inferred), component sets ARE variant axes (not guessed from class differences), auto-layout IS layout spec.

The Figma MCP tools are already available in this environment (`get_metadata`, `get_design_context`, `get_variable_defs`, `search_design_system`, `get_libraries`). These tools can read any Figma file the user has access to — we just need a URL.

## What Changes

- Add Figma URL input to the Import page (alongside existing ZIP upload)
- Create a Figma adapter in `packages/adapters/figma` that:
  1. Parses a Figma file URL to extract `fileKey`
  2. Uses the Figma MCP tools to read the file structure, variables, components, and styles
  3. Maps Figma's data to VortSpec IR: variables → DesignTokens (`confidence: 'confirmed'`), component sets → ComponentIR with variant axes, fills/effects without variables → mined candidates (`confidence: 'inferred'`)
  4. Persists tokens + components to Supabase (same end state as ZIP import)
- Create a server action `importFromFigma(projectId, figmaUrl)` that orchestrates the MCP calls
- The import runs as an API route (not Inngest) since MCP tools are available in the server context
- Progress tracking via the same `imports` table and `stage_states` JSONB

## Capabilities

### New Capabilities
- `figma-adapter`: Figma file reading via MCP, mapping Figma semantics to VortSpec IR
- `figma-import-flow`: UI for pasting a Figma URL and tracking import progress

### Modified Capabilities
- `import-flow`: Add Figma URL import option alongside ZIP upload

## Impact

- **New package:** `packages/adapters/` with `figma.ts`
- **Modified:** `apps/web` — import page gets Figma URL input, new API route for Figma import
- **DB:** Uses existing tables (sources with `kind: 'figma'`, imports, tokens, components)
- **Dependencies:** Figma MCP tools (already available), no new npm packages needed
