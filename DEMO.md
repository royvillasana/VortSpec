# VortSpec M0 + M1 Demo

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- A Supabase project (hosted) with the migration applied

## Setup

```bash
# Install dependencies
pnpm install

# Copy env template and fill in your Supabase credentials
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local with your Supabase URL, anon key, and service role key
# Set VORTSPEC_DEV_BYPASS_AUTH=true for development

# Apply the database migration to your Supabase project
# Run the SQL in supabase/migrations/00001_initial_schema.sql
# via the Supabase Dashboard SQL Editor

# Build packages
pnpm build

# Run tests
pnpm test
```

## M0: Foundation

**Done when:** the Button fixture from the IR schemas doc validates against the Zod schemas.

```bash
# Verify IR schemas + Button fixture
pnpm --filter @vortspec/ir test

# Expected: 13 tests pass
# - Button fixture parses successfully
# - Unflagged literal rejected (core invariant)
# - token.delete without fallback rejected
# - Round-trip serialization works
```

## M1: ZIP Ingest + Pipeline (Deterministic)

**Done when:** a real export ZIP imported through the UI produces normalized components with mined token candidates, all validated against Zod schemas.

```bash
# Start the dev server
pnpm --filter @vortspec/web dev

# In a separate terminal, start Inngest dev server
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

### Demo flow

1. Open http://localhost:3000/projects
2. Click "New project" → navigate to import page
3. Drop a ZIP file (HTML/CSS export) onto the upload zone
4. Click "Start import" → file uploads to Supabase Storage
5. Watch the progress screen — stages update in real time via polling
6. **Stage 1 (Parse):** unzips, counts HTML/CSS files and nodes
7. **Stage 2 (Style Mining):** extracts all CSS declarations, groups by (property, value), computes usage counts
8. **Stage 3 (Token Inference):** stub — token promotion handled in report stage
9. **Stage 4 (Structure Inference):** detects repeated patterns as components, infers variant axes and states from classes and pseudo-classes
10. **Stage 5 (DS Merge):** stub — needs companion DS upload
11. **Stage 6 (Report):** promotes high-usage values to tokens, rewrites component styles, computes completeness scores, persists tokens + components to DB
12. Completion summary shows real counts (N tokens, N components, N issues)

### Pipeline tests

```bash
# Run all pipeline tests (52 tests across 5 files)
pnpm --filter @vortspec/pipeline test

# Parse (8 tests): file/node counting, error cases
# Style Mining (7 tests): declaration extraction, grouping, Claude Design snapshot
# Structure Inference (10 tests): component detection, variants, states, Zod validation
# Report (25 tests): token promotion, value parsing, completeness scoring, Zod validation
# Integration (2 tests): end-to-end pipeline with Zod schema validation
```

### Fixtures

- `packages/pipeline/src/__fixtures__/claude-design-export.zip` — real Claude Design HTML/CSS export (8 screens)
- `packages/pipeline/src/__fixtures__/create-minimal-zip.ts` — synthetic: 1 HTML with 2 button variants, 1 CSS

### M1 exit criterion

After importing the Claude Design export:
- Tokens exist in the `tokens` table with valid `DesignToken` JSONB docs
- Components exist in the `components` table with `status: 'normalized'` and valid `ComponentIR` JSONB docs
- All IR docs validate against Zod schemas (verified by integration test)

## Security

`VORTSPEC_DEV_BYPASS_AUTH=true` skips auth and uses the service-role key. **This throws at startup if `NODE_ENV=production`** — it can never reach a production build.

## Project Structure

```
VortSpec/
├── apps/web/              Next.js 16 frontend (12 routes, 8 screens)
├── packages/ir/           Zod IR schemas (source of truth) — 13 tests
├── packages/pipeline/     Import pipeline (Inngest functions) — 52 tests
├── supabase/migrations/   Database schema + RLS
├── turbo.json             Turborepo config
├── pnpm-workspace.yaml    Monorepo workspace
└── DEMO.md
```
