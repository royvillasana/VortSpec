## Why

Token sync today is one-way: Figma is the source of truth and VortSpec pulls variables into the code token file (`syncVariablesToCache` → `.vortspec/figma-variables.json` → reconcile). But users edit tokens in the cockpit — creating, renaming, and re-valuing them in the Inspector — and those changes have no path back to Figma, so the design file silently drifts behind the code. To make the sync genuinely two-way, the user needs an explicit, on-demand way to push code-side token changes into the Figma Variables collection, without VortSpec ever calling Figma directly or overwriting design intent unasked.

## What Changes

- Add a **"Send to Figma"** action in the Inspector Tokens panel that pushes the current code token file into the Figma Variables collection named by `figma_token_collection` (default `Tokens`), on explicit user click only — never automatically.
- **Preview-and-confirm gate:** before anything is written to Figma, the user sees exactly what will be created and what will be updated (per-token: name, new value, current Figma value), consistent with the spec-first gating invariant. Nothing mutates Figma without a recorded confirmation.
- Push runs through the existing two-path model, mirroring the pull direction:
  - **Preferred:** `figma-cli` eval (fast, no Claude usage) writing/updating variables in the connected file.
  - **Fallback:** a scoped Claude Code run using the user's own Figma MCP, calling `figma_batch_create_variables` / `figma_batch_update_variables`.
- **Alias preservation:** a code token defined as `var(--other)` is pushed as a Figma variable **alias** to the referenced variable where that variable exists in the collection, rather than being flattened to a resolved value. Tokens with no resolvable reference push their concrete value.
- The existing Figma→code pull is unchanged; after a push completes, the local reconcile re-runs so drift indicators reflect the new in-sync state.
- Drift indicators gain direction awareness: a token that exists in code but not Figma is surfaced as **pushable** (not merely `generated-code`), giving the "Send to Figma" affordance something to act on.

## Capabilities

### New Capabilities
- `figma-token-push`: On-demand, gated push of the code token file into the Figma Variables collection — the code→Figma half of two-way token sync. Covers the preview/confirm contract, the CLI-preferred / MCP-fallback execution model, alias preservation for `var(--x)` references, delegation (VortSpec never calls Figma directly), and post-push reconciliation.

### Modified Capabilities
- `inspector-tokens`: The Tokens panel gains a "Send to Figma" affordance and a directional drift/push state. New requirements for the push-trigger UI, its confirmation gate, and pushable-token indication; the existing pull, browse, edit, rename, and delete behavior is unchanged.

## Impact

- **UI** (`packages/ui/src/views/Inspector.tsx`): new "Send to Figma" button, a push preview/confirm panel, wiring to a new push run (parallel to the existing `figmaSync` / `tokenMod` flows).
- **Core main** (`packages/core/src/main/`):
  - `figma/figma-cli.ts`: new push path (`pushVariablesFromTokenFile` via an eval script that creates/updates variables + aliases).
  - `inspector/figma-reconcile.ts` (or a sibling): compute the push plan (create vs. update vs. alias) from parsed code tokens + the Figma-variable cache.
  - A new push prompt (MCP fallback) alongside `FIGMA_SYNC_PROMPT`, naming `figma_batch_create_variables` / `figma_batch_update_variables`.
- **IPC** (`packages/core/src/shared/`): a new contract to request a push plan and to execute the CLI push; Zod at the boundary.
- **Invariants:** must hold spec-first gating (#3), the-user's-own-Claude (#4), non-bare real-binary delegation (#5), and never-call-Figma-directly (VortSpec remains the cockpit; the engine/CLI does the writing).
- **Tests:** unit tests for push-plan computation and alias resolution; a recorded transcript fixture for the MCP-fallback push run.
