/**
 * Model routing for gated SDD-DE runs (rollout R2/R3).
 *
 * VortSpec drives the user's OWN Claude Code, so `--model` is a best-effort hint,
 * not a guarantee: a subscription login may honor it, silently coerce it, or
 * reject it. So we route the mechanical/structured sub-steps to a cheaper tier
 * (verify → Sonnet, mechanical audits → Haiku) to spend less of the user's limit
 * and go faster — but ALWAYS detect whether the request was honored and, if not,
 * fall back to the default model for the rest of the session. Never a hard error.
 *
 * This stores nothing about the user's plan; the flag is a per-machine cache of
 * "does --model work on this login" learned from a run's actual system-init model.
 */

export type ModelTier = "opus" | "sonnet" | "haiku";

const DISABLED_KEY = "vortspec.modelRoutingUnavailable";

/** Whether model routing has been disabled (a prior run showed the login ignores `--model`). */
export function isRoutingDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark routing unavailable for this login — every run then uses the default model. */
export function disableRouting(): void {
  try {
    localStorage.setItem(DISABLED_KEY, "1");
  } catch {
    /* best-effort */
  }
}

/**
 * The `--model` alias to request for a step's tier, or `undefined` to run on the
 * user's default. Returns undefined when routing is disabled or the tier is the
 * default (opus), so we never send a redundant/mismatched flag.
 */
export function routedModel(tier: ModelTier): string | undefined {
  if (tier === "opus" || isRoutingDisabled()) return undefined;
  return tier;
}

/**
 * Did the session actually run on the requested tier? Compares the requested
 * alias to the model id from `system-init` by family word. Unknown/empty → treat
 * as honored (don't disable on missing telemetry). Used to detect a login that
 * ignores `--model`.
 */
export function modelHonored(requested: ModelTier, actualModelId: string | undefined | null): boolean {
  if (!actualModelId) return true;
  return actualModelId.toLowerCase().includes(requested);
}
