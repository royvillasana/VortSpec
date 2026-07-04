import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Model cascade: free first, then cheapest
const MODEL_CASCADE = [
  "google/gemini-2.0-flash-exp:free",       // Free, very capable
  "meta-llama/llama-4-maverick:free",        // Free, good for structured output
  "google/gemma-3-27b-it:free",              // Free fallback
  "google/gemini-2.0-flash-001",             // Very cheap ($0.10/M tokens)
  "anthropic/claude-sonnet-4",               // More expensive but excellent
];

export interface LLMResponse {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Call an LLM with automatic model cascade.
 * Tries free models first, then cheap ones.
 */
export async function llmComplete(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<LLMResponse> {
  const temperature = options?.temperature ?? 0;
  const maxTokens = options?.maxTokens ?? 4096;

  for (const model of MODEL_CASCADE) {
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
      if (!content) continue; // Empty response, try next model

      return {
        content,
        model,
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] Model ${model} failed: ${msg}, trying next...`);
      continue;
    }
  }

  throw new Error("All LLM models failed. Check your OPENROUTER_API_KEY.");
}

/**
 * Call an LLM expecting JSON output. Parses and validates.
 */
export async function llmJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  validate: (data: unknown) => T,
  options?: { temperature?: number; maxTokens?: number },
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
      userPrompt + "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a JSON object, no markdown fences, no explanation.",
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
