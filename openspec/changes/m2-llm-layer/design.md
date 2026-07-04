## Context

VortSpec has a working pipeline (M0+M1) that extracts tokens and detects components deterministically. Tokens are named by CSS property+value (`color/#191510`), components are named generically (`Component-4`). Stage 3 (token inference) and stage 4 LLM assist are stubs. An `llm.ts` utility already exists in `packages/pipeline/src/lib/llm.ts` with OpenRouter integration and model cascade — this was prototyped but needs to be formalized into a proper `packages/llm` provider.

## Goals / Non-Goals

**Goals:**
- LLM-powered semantic token naming: `color/#191510` → `color/background/dark`
- LLM-powered component detection: identify real UI components from HTML, not structural noise
- Provider-agnostic: OpenRouter today, direct Anthropic/OpenAI tomorrow
- Cost-conscious: free models first (Gemini Flash, Llama), fall back to cheap ones
- Every LLM call logged to `llm_usage` table for metering
- Zod validation on all structured outputs with one retry

**Non-Goals:**
- Conversational editing (M4)
- BYOK key encryption via Vault (use simple encrypted column for now)
- Usage caps and billing (defer to when there's a billing system)
- Figma adapter (M4)

## Decisions

### 1. OpenRouter as the unified provider

Use OpenRouter's OpenAI-compatible API. Model cascade:
1. `google/gemini-2.0-flash-exp:free` — free, very capable
2. `meta-llama/llama-4-maverick:free` — free fallback
3. `google/gemini-2.0-flash-001` — $0.10/M tokens
4. `anthropic/claude-sonnet-4` — higher quality fallback

**Rationale:** Single API key, access to all models, cost optimization built-in. The PRD says `LLMProvider` interface with Anthropic default — OpenRouter gives us Anthropic models through the same interface.

### 2. packages/llm as a thin wrapper

Move the existing `packages/pipeline/src/lib/llm.ts` into `packages/llm` as a proper package. Expose:
- `llmComplete(system, user, options)` → text response
- `llmJSON(system, user, validator, options)` → parsed + validated JSON
- `setLLMConfig({ apiKey, models })` — runtime config for BYOK

### 3. Token naming via batch LLM call

Stage 3 sends all mined style groups (property + value + usage count) to the LLM in one batch call. The LLM returns semantic names grouped by role:
- Input: `[{ property: "background-color", value: "#191510", usageCount: 12 }, ...]`
- Output: `[{ originalValue: "#191510", name: "color/background/dark", role: "background", group: "neutral" }, ...]`

One call, not per-token. Validated against Zod schema.

### 4. Component detection via page-level analysis

Stage 4 LLM assist sends truncated HTML pages (first 3000 chars each, up to 5 pages) to the LLM. The LLM identifies real UI components, names them, and describes their props and variants. The deterministic detection runs as a fallback if LLM fails.

### 5. Usage metering

Every `llmComplete`/`llmJSON` call logs to `llm_usage` table:
```sql
INSERT INTO llm_usage (project_id, provider, model, tokens_in, tokens_out, purpose)
```
Purpose examples: `"token-inference"`, `"component-detection"`

## Risks / Trade-offs

- **Free model quality** → May produce poor names. Mitigation: all names are `confidence: 'inferred'`, user can rename in Inspector.
- **Token limits** → Large HTML files may exceed context. Mitigation: truncate to 3000 chars per file, max 5 files.
- **Latency** → LLM calls add 5-30s to pipeline. Mitigation: stages already run async via Inngest, user sees progress.
- **Cost** → Free models may become unavailable. Mitigation: cascade falls through to cheap paid models.
