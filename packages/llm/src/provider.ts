import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ─── Configuration ────────────────────────────────────────────

interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  models?: string[];
}

let config: LLMConfig = {};

/**
 * Configure the LLM provider at runtime (for BYOK).
 */
export function setLLMConfig(cfg: LLMConfig) {
  config = { ...config, ...cfg };
}

function getClient(): OpenAI {
  return new OpenAI({
    baseURL: config.baseURL ?? "https://openrouter.ai/api/v1",
    apiKey: config.apiKey ?? process.env.OPENROUTER_API_KEY ?? "",
  });
}

// Model cascade: free first, then cheapest
const DEFAULT_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-4-maverick:free",
  "google/gemma-3-27b-it:free",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-sonnet-4",
];

function getModels(): string[] {
  return config.models ?? DEFAULT_MODELS;
}

// ─── Response types ───────────────────────────────────────────

export interface LLMResponse {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

// ─── Usage metering ───────────────────────────────────────────

export async function logUsage(
  projectId: string,
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  purpose: string,
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    await supabase.from("llm_usage").insert({
      project_id: projectId,
      provider,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      purpose,
    });
  } catch {
    // Non-fatal — metering should never break the pipeline
  }
}

// ─── Core LLM calls ──────────────────────────────────────────

/**
 * Call an LLM with automatic model cascade.
 * Tries free models first, then cheap ones.
 */
export async function llmComplete(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; projectId?: string; purpose?: string },
): Promise<LLMResponse> {
  const client = getClient();
  const temperature = options?.temperature ?? 0;
  const maxTokens = options?.maxTokens ?? 4096;
  const models = getModels();

  for (const model of models) {
    try {
      const response = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "";
      if (!content) continue;

      const tokensIn = response.usage?.prompt_tokens ?? 0;
      const tokensOut = response.usage?.completion_tokens ?? 0;

      // Log usage if project context provided
      if (options?.projectId) {
        await logUsage(
          options.projectId,
          "openrouter",
          model,
          tokensIn,
          tokensOut,
          options.purpose ?? "unknown",
        );
      }

      return { content, model, tokensIn, tokensOut };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] Model ${model} failed: ${msg}, trying next...`);
      continue;
    }
  }

  throw new Error(
    "All LLM models failed. Check your OPENROUTER_API_KEY or network connection.",
  );
}

/**
 * Call an LLM expecting JSON output. Parses and validates with one retry.
 */
export async function llmJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  validate: (data: unknown) => T,
  options?: { temperature?: number; maxTokens?: number; projectId?: string; purpose?: string },
): Promise<{ data: T; model: string; tokensIn: number; tokensOut: number }> {
  const response = await llmComplete(systemPrompt, userPrompt, options);

  // Extract JSON from response (might be wrapped in ```json...```)
  let jsonStr = response.content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Retry once with explicit instruction
    const retryResponse = await llmComplete(
      systemPrompt,
      userPrompt +
        "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a JSON object, no markdown fences, no explanation.",
      options,
    );
    let retryStr = retryResponse.content.trim();
    const retryFence = retryStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (retryFence) retryStr = retryFence[1].trim();
    parsed = JSON.parse(retryStr);
  }

  return {
    data: validate(parsed),
    model: response.model,
    tokensIn: response.tokensIn,
    tokensOut: response.tokensOut,
  };
}
