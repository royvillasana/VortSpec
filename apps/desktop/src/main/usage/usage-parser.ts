import type { UsageLimit } from "../../shared/usage";

/**
 * Parse the text of Claude Code's `/usage` command into structured limit bars.
 * The format (Claude Code 2.x):
 *
 *   You are currently using your subscription to power your Claude Code usage
 *
 *   Current session: 7% used · resets Jul 7 at 6:30pm (Europe/Madrid)
 *   Current week (all models): 46% used · resets Jul 8 at 2am (Europe/Madrid)
 *   Current week (Fable): 0% used
 *
 *   What's contributing to your limits usage?
 *   Approximate, based on local sessions on this machine — …
 *
 * Isolated + pure so it can be unit-tested against recorded output; degrades to
 * an empty limit list on an unfamiliar shape rather than throwing.
 */
const LIMIT_RE = /^(.*?):\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s*(.+?))?\s*$/;

export interface ParsedUsage {
  headline: string | null;
  limits: UsageLimit[];
  note: string | null;
}

export function parseUsage(text: string): ParsedUsage {
  const lines = text.split("\n");
  const limits: UsageLimit[] = [];
  let headline: string | null = null;
  let note: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = LIMIT_RE.exec(trimmed);
    if (m) {
      limits.push({
        label: m[1].trim(),
        percent: Number(m[2]),
        resetsAt: m[3] ? m[3].trim() : null,
      });
      continue;
    }
    if (!headline && /using your (subscription|api|claude)/i.test(trimmed)) {
      headline = trimmed;
    }
    if (!note && /^approximate\b/i.test(trimmed)) {
      note = trimmed;
    }
  }

  return { headline, limits, note };
}
