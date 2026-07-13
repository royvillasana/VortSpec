## 1. Push plan (core, pure)

- [x] 1.1 Define the push-plan types in `packages/core/src/shared/` (e.g. `PushPlanEntry { name; op: "create" | "update"; value?; aliasTarget?; currentFigmaValue? }`, `PushPlan`) with Zod schemas at the boundary.
- [x] 1.2 Add `computePushPlan(tokens, figmaVars)` beside `reconcile()` in `figma-reconcile.ts` (or a sibling `figma-push.ts`): diff parsed code tokens against the Figma-variable cache by `normName`; classify each as create (no Figma match) or update (drifted); skip in-sync tokens.
- [x] 1.3 Implement alias resolution in the plan: when a token's raw declaration is `var(--other)` and a Figma variable for `other` exists in the cache, set `aliasTarget`; otherwise carry the resolved concrete value. Reuse the token parser's raw + resolved values.
- [x] 1.4 Cover every token type: map `TokenType` → Figma variable type (color→COLOR, spacing/radius→FLOAT, other→STRING). For `typography`/`shadow` composites, expand the plan into their scalar sub-variables (typography → font-family/font-size/line-height/weight; shadow → offset-x/offset-y/blur/spread/color) as create/update entries — never skip.
- [x] 1.5 Unit tests: create-vs-update classification, alias vs. concrete fallback, in-sync skip, composite decomposition into scalar entries, every-type-covered, and a pull→push→pull round-trip that yields an empty plan (no-op idempotency).

## 1b. Token creation (core + UI seam)

- [x] 1b.1 Add `createToken(projectPath, { name, value, type })` in core: validate the name, reject duplicates by `normName`, and insert the CSS custom property under the correct `@theme` grouping in the token file; mark it `hand-edited`. Return the refreshed token list + usage.
- [x] 1b.2 Unit tests: creates under the right group, rejects duplicate normalized names, preserves file formatting.

## 2. CLI push path (preferred)

- [x] 2.1 Add `pushVariablesFromTokenFile(projectPath, plan)` to `figma-cli.ts` following the existing eval pattern (write a temp JS script, `run(["eval", tmp])`).
- [x] 2.2 Author the eval script: locate the `VortSpec` collection (create it if absent), then per plan entry create or update the variable, binding aliases where `aliasTarget` is set and `setValueForMode` for concrete values. Confine writes to that collection; never delete.
- [x] 2.3 Return a structured `FigmaSyncResult`-style outcome (created count, updated count, skipped, detail on failure); add a parser unit test over recorded eval output.

## 3. MCP fallback push path

- [x] 3.1 Add a push prompt beside `FIGMA_SYNC_PROMPT` in `Inspector.tsx` (or move both to a shared prompts module): instruct a scoped Claude run to apply the plan using `figma_batch_create_variables` for creates and `figma_batch_update_variables` for updates, write ONLY to the target collection, preserve aliases, and change nothing else in Figma.
- [x] 3.2 Ensure the run is scoped/non-bare with the user's own MCP (bypassPermissions consistent with the existing sync run) and is handed the confirmed plan as input.
- [ ] 3.3 Add a recorded stream-json transcript fixture for the push run and a deterministic test asserting the batch tools are the intended calls.

## 4. IPC wiring

- [x] 4.1 Add IPC contracts in `packages/core/src/shared/ipc.ts`: `computeFigmaPushPlan(projectPath)` and `pushTokensToFigmaCli(projectPath, plan)`, with Zod validation at the boundary.
- [x] 4.2 Implement the main-process handlers, choosing CLI vs. surfacing "use MCP fallback" based on `figma-cli` connection state (mirror `syncFigma`'s branch logic).

## 5. Inspector UI

- [x] 5.1 Add a "Send to Figma" control to the Tokens panel, enabled only when a writer (CLI or MCP) is connected; disabled with a hint otherwise.
- [x] 5.2 On click, call `computeFigmaPushPlan` and render a preview/confirm gate (parallel to `modReview`): per-token create/update, target name, outgoing value or alias target, and current Figma value for updates; report "already in sync" for an empty plan.
- [x] 5.3 On confirm, execute via CLI (`pushTokensToFigmaCli`) or start the MCP-fallback push run; on cancel, write nothing.
- [x] 5.4 After a successful push, refresh the Figma-variable cache and re-run reconcile (reuse the existing "run done → reloadTokens" effect) so drift indicators update; flash a result toast.
- [x] 5.5 Add a "pushable" indication to code-only / drifted token rows so users see what the action will affect, without changing in-sync source-badge semantics.
- [x] 5.6 Add a "New token" control + form (name, value, type) that calls `createToken` and refreshes the panel; surface duplicate-name rejection as a human-readable message.

## 6. Errors, docs, and verification

- [x] 6.1 Render the no-writer-connected case as a fixed, human-readable fix-it message (never raw exceptions), consistent with the existing sync messaging. The `VortSpec` collection is auto-created on push, so an absent collection is not an error; the result message reports when it was created.
- [x] 6.2 Update `sync-tokens` SKILL.md (both copies: `.claude/skills/` and `.sdd-de/ai-specs/skills/`) and `design-token-model.md` to document the on-demand code→Figma push and the two-way model.
- [ ] 6.3 End-to-end UI verification: create a token in the Inspector, click "Send to Figma", confirm the plan, and verify the variable appears/updates in the auto-created `VortSpec` collection and drift clears; verify an alias token lands as a Figma alias.
- [x] 6.4 Ensure `pnpm build && pnpm test && pnpm lint` are green.
