## Why

M1 produces tokens named `color/#191510` and components named `Component-4` — raw identifiers that are unusable for design system work. The deterministic pipeline extracts structure but cannot understand intent. Designers need tokens named `color/primary/500` and components named `Navigation Bar`. This requires LLM assistance for semantic naming, intelligent component detection, and role grouping.

The PRD requires M2 before the product is useful: *"Done when: the same import now yields semantically named tokens, all marked inferred."*

## What Changes

- Create `packages/llm` with an `LLMProvider` interface supporting OpenRouter (with model cascade: free models first, then cheap ones)
- **Stage 3 (Token Inference):** LLM names and role-groups mined token candidates. Batch call with structured output validated by Zod. Near-duplicates produce merge suggestions as issues. Temperature 0 for stability.
- **Stage 4 (Structure Inference) LLM assist:** LLM analyzes HTML pages to identify real UI components (navigation, cards, buttons, forms) vs structural noise. Names components meaningfully. Identifies props, variants, and semantic roles.
- Add LLM usage metering: log provider, model, tokens in/out, purpose per call to `llm_usage` table
- Add AI provider configuration per project (BYOK or use platform OpenRouter key)
- Every LLM call: temperature 0, Zod-validated output, one retry with validation error appended, then graceful failure

## Capabilities

### New Capabilities
- `llm-provider`: LLM provider interface with OpenRouter implementation, model cascade (free → cheap), BYOK support, usage metering
- `token-inference`: Stage 3 — LLM semantic naming and role-grouping of mined token candidates
- `llm-component-detection`: Stage 4 LLM assist — intelligent component detection, naming, prop inference

### Modified Capabilities
- `import-flow`: Pipeline stages 3 and 4 upgraded from stubs to real LLM-assisted implementations

## Impact

- **New package:** `packages/llm` — provider interface + OpenRouter implementation
- **Modified:** `packages/pipeline` — stages 3 and 4 use LLM
- **Modified:** `apps/web` — AI provider settings UI, usage display
- **DB:** `llm_usage` table already exists, `project_ai_keys` table already exists
- **Env:** `OPENROUTER_API_KEY` for platform default
