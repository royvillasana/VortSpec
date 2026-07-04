## 1. LLM Provider Package

- [x] 1.1 Create `packages/llm/` with package.json (deps: openai), tsconfig, vitest config
- [x] 1.2 Move `packages/pipeline/src/lib/llm.ts` → `packages/llm/src/provider.ts`, update model cascade with current best free models
- [x] 1.3 Add usage metering: `logUsage(projectId, model, tokensIn, tokensOut, purpose)` writes to `llm_usage` table
- [x] 1.4 Add `setLLMConfig({ apiKey, models })` for runtime BYOK configuration
- [x] 1.5 Export barrel `packages/llm/src/index.ts`
- [x] 1.6 Add `@vortspec/llm` as dependency to `packages/pipeline`

## 2. Stage 3: Token Inference (LLM)

- [x] 2.1 Create `packages/pipeline/src/stages/token-inference.ts` with `runTokenInferenceCore(styleGroups, options)`
- [x] 2.2 Build the token naming prompt: send all style groups as JSON, ask for semantic names following `category/role/scale` convention
- [x] 2.3 Define Zod schema for LLM response: `Array<{ originalProperty, originalValue, name, role, group }>`
- [x] 2.4 Implement near-duplicate detection: compare color values within delta-E threshold, create `near-duplicate-tokens` issues
- [x] 2.5 Implement deterministic fallback: if LLM fails, use `property/value` naming (current behavior)
- [x] 2.6 Wire into pipeline `import.ts`: replace stage 3 stub with real token inference
- [x] 2.7 Log LLM usage to `llm_usage` table after each call
- [x] 2.8 Tests: token naming produces valid names, near-duplicate detection works, fallback on LLM failure

## 3. Stage 4: LLM Component Detection

- [x] 3.1 Formalize `packages/pipeline/src/stages/llm-component-detection.ts` (already prototyped)
- [x] 3.2 Improve the system prompt: emphasize quality over quantity, 5-15 components, design-system-appropriate names
- [x] 3.3 Add prop and variant inference to the LLM prompt
- [x] 3.4 Build Zod schema for LLM component response validation
- [x] 3.5 Combine LLM detection with deterministic detection: LLM first, deterministic as fallback
- [x] 3.6 Wire into pipeline `import.ts`: stage 4 uses LLM when API key available
- [x] 3.7 Log LLM usage after component detection call
- [x] 3.8 Tests: LLM response validates, fallback works, components have meaningful names

## 4. Usage Metering & Settings

- [x] 4.1 Add AI provider settings to project settings page: show current provider, model cascade, usage stats
- [x] 4.2 Display LLM usage per project: total tokens used, model breakdown, cost estimate
- [x] 4.3 Add `OPENROUTER_API_KEY` to `.env.local.example`

## 5. Integration & Verification

- [x] 5.1 End-to-end test: upload ZIP → pipeline runs with LLM stages → tokens have semantic names
- [x] 5.2 Verify: same ZIP imported twice produces same token names (temperature 0)
- [x] 5.3 Verify: LLM failure degrades gracefully to deterministic naming
- [x] 5.4 Update DEMO.md with M2 setup (OpenRouter API key) and expected behavior
- [x] 5.5 Verify `pnpm build && pnpm test` all green
