## Context

Token sync in VortSpec is currently one-directional, Figma → code:

- **Preferred:** `figma-cli` exports the connected file's variables as DTCG, flattened into `.vortspec/figma-variables.json` (`figma-cli.ts::syncVariablesToCache`).
- **Fallback:** a scoped Claude Code run with the user's own Figma MCP (`FIGMA_SYNC_PROMPT` in `Inspector.tsx`) writes the same cache file.
- `figma-reconcile.ts` parses that cache and diffs it against the parsed code token file (`tokens.css`, CSS custom properties) by normalized name, producing `in-sync` / `drifted` / `figma-only` verdicts.

The architecture invariant is firm: **VortSpec is the cockpit, the engine (CLI or Claude+MCP) does all Figma I/O.** No VortSpec process opens a Figma connection. Existing token *mutations* (rename, delete, value edit) already run through gated, snapshot-backed flows (`runTokenMod`) and write only local files.

This change adds the reverse direction — code → Figma — as an explicit, gated, user-triggered push, reusing the two-path (CLI-preferred / MCP-fallback) model and the delegation invariant already established for the pull.

## Goals / Non-Goals

**Goals:**
- A single "Send to Figma" action that pushes the code token file into the `figma_token_collection` (default `Tokens`) variables collection, on explicit click only.
- A preview/confirm gate that shows exactly what will be created vs. updated before any Figma write, honoring the spec-first gating invariant.
- Reuse the CLI-preferred / MCP-fallback execution model; the MCP fallback uses `figma_batch_create_variables` / `figma_batch_update_variables`.
- Preserve `var(--x)` references as Figma variable aliases where the referenced variable exists, instead of flattening.
- Keep the existing Figma→code pull and all local token flows unchanged; re-reconcile after a push so drift state is current.

**Non-Goals:**
- No automatic/continuous background sync. "Two-way, continuously reconciled" here means *both directions are available on demand and the drift view always reflects reality* — not a daemon that writes Figma without asking.
- No deletion of Figma variables that lack a code counterpart (create/update only this iteration).
- No new collection creation semantics beyond the configured target collection; if the collection is absent, that is surfaced as a fix-it, not auto-created (open question below).
- No mode/theme fan-out — push targets the default/primary mode, symmetric with the pull, which resolves the primary mode.

## Decisions

### Decision: Compute the push plan locally, execute remotely
The main process computes a **push plan** by diffing parsed code tokens against the `.vortspec/figma-variables.json` cache — pure file computation, sibling to `reconcile()` in `figma-reconcile.ts`. Each entry is `{ name, op: "create" | "update", value | aliasTarget, currentFigmaValue? }`. The plan is what the UI previews and the user confirms; only on confirm does the engine write.

- *Why:* Keeps the decision surface (what changes) inside VortSpec where it can be shown and gated, while all actual Figma writes stay in the engine — preserving the never-call-Figma-directly invariant. It mirrors the existing pull, where reconcile is local and export is delegated.
- *Alternative considered:* Have the Claude run compute and apply the diff itself. Rejected — it hides the plan from the gate, spends Claude usage even for the CLI path, and makes the preview non-deterministic.

### Decision: Reuse the two-path execution model
Push executes via `figma-cli` when connected, else via a scoped Claude Code run. The CLI path adds a `pushVariablesFromTokenFile`-style function driving an eval script (same mechanism as `SELECTION_SCRIPT` / `READ_COMPONENTS_SCRIPT`: write a temp JS file, `run(["eval", tmp])`) that iterates the plan and calls `figma.variables.createVariable` / `setValueForMode` / alias binding. The MCP path adds a push prompt alongside `FIGMA_SYNC_PROMPT` that names `figma_batch_create_variables` / `figma_batch_update_variables` and is handed the plan.

- *Why:* Symmetry with the pull; users already connect one of the two. CLI avoids Claude usage for the common case.
- *Alternative considered:* MCP-only. Rejected — spends usage on every push and is slower; the CLI is already the preferred reader.

### Decision: Alias resolution happens in the plan, not the writer
When a code token's raw declaration is `var(--other)`, the plan records `aliasTarget: "other"` if a Figma variable for `other` exists in the cache; otherwise it records the resolved concrete value. The token parser already resolves `var()` references for values, so the plan carries both the raw reference and the resolved value and decides alias-vs-concrete centrally.

- *Why:* Both writers (CLI eval and MCP batch) then receive an unambiguous instruction (alias to variable X, or set concrete value), keeping alias logic in one tested place instead of duplicated across two engines.
- *Trade-off:* A token referencing a variable that isn't yet in Figma flattens on first push; a subsequent push (after that variable exists) can re-establish the alias. Acceptable and surfaced in the preview.

### Decision: Gate + post-push reconcile reuse existing patterns
The preview/confirm UI parallels the `modReview` gate; the post-push refresh reuses the existing "run finished → reloadTokens/reconcile" effect pattern. A push does not need a local file snapshot (it doesn't mutate code files), but the confirm gate is mandatory.

- *Why:* Consistency with the rename/delete review flow the user already knows; minimal new UI surface.

## Risks / Trade-offs

- **Destructive/wrong Figma writes** → Mitigated by the mandatory preview/confirm gate (create/update only, no deletes), confining writes to the configured collection, and never touching styles/layers/components.
- **Alias to a not-yet-existing variable flattens** → Surfaced in the preview as "concrete (reference not in Figma yet)"; re-push restores the alias once present. Documented, not silent.
- **CLI eval variable API drift** → The figma-cli eval script depends on the Figma plugin variables API shape; isolate it behind one function with a recorded-output unit test, consistent with how `AgentAdapter` isolates CLI knowledge.
- **Name collisions / normalization mismatch** → Push must match existing Figma variables by the same `normName` used in reconcile so an update targets the right variable instead of creating a duplicate. Reuse `normName`; test round-trip (pull → push → pull is a no-op).
- **Partial push failure (MCP path)** → Batch create then batch update; if the run fails mid-way, re-reconcile shows remaining drift and the user can re-push (idempotent create-or-update). No local state corruption since VortSpec files are untouched.

## Migration Plan

Additive, no data migration. Ships behind the existing Figma-connection checks; when no writer is connected the "Send to Figma" control is disabled with a hint, so the feature is inert until a user opts into a push. Rollback is removing the button + push path; the pull and all local flows are untouched.

## Resolved Decisions (previously open)

- **Absent target collection → fix-it, not auto-create.** If `figma_token_collection` doesn't exist in the file, the push surfaces a fixed, human-readable message naming the collection and asking the user to create it in Figma first. VortSpec never implies structural authorship of the design file by creating collections.
- **Composite `typography`/`shadow` tokens → create and push, never skip.** A composite token with no Figma representation is decomposed into the scalar Figma variables it needs (typography → font-family / font-size / line-height / weight; shadow → offset-x / offset-y / blur / spread / color) under the target collection, and updated on later pushes. The push plan covers every token type so a completed push leaves nothing unrepresented. If a needed sub-variable is missing in code, it is created there first (see token-creation flow below) so the decomposition is complete.
- **Token creation flow.** The Tokens panel gains a "New token" action: name + value + type, written to the token file as a CSS custom property under the correct `@theme` grouping, marked `hand-edited`. Creation is duplicate-checked by `normName`. A newly created token is immediately pushable, which is how a user seeds missing typography/shadow tokens before pushing them to Figma.
- **Confirmation granularity → whole-plan confirm.** One confirm for the whole plan (create + update) for now; per-token opt-out can be added later without a spec change.
