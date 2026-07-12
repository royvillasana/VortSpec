import { execFileSafe } from "../util/exec";
import { readProjectConfig } from "../workspace/config-manager";
import { figmaHealthModeSchema, type FigmaHealth, type FigmaHealthMode } from "@vortspec/core/figma";

/**
 * Validates the Figma READ path the foundation extraction depends on — not just
 * that an MCP is "connected", but that design VARIABLES and STYLES can actually
 * be read. A shallow `claude mcp list` handshake reports "connected" even when
 * the REST token is expired (403) or the Desktop Bridge plugin is closed, and
 * the extraction then silently falls back to guessing token values from a few
 * visible instances (the exact failure this guards against).
 *
 * VortSpec never talks to Figma directly (Claude Code is the engine): this runs
 * a scoped, read-only `claude -p` diagnostic that uses the user's own Figma MCP
 * to attempt the read, then classifies the outcome into an actionable fix.
 */

/** The read-only diagnostic prompt. It must end with ONLY the verdict JSON. */
export function figmaHealthPrompt(figmaFileUrl?: string): string {
  const target = figmaFileUrl
    ? `the Figma file at:\n${figmaFileUrl}`
    : "the Figma file configured for this project (read `figma_file_url` from .sdd-de/project.yaml)";
  return [
    "You are a READ-ONLY Figma connection diagnostic. Do NOT modify anything — not in Figma, not on disk.",
    `Determine whether design VARIABLES and text/color STYLES can be read from ${target} through ANY available Figma MCP.`,
    "",
    "Steps:",
    "1. PREFER the official remote Figma MCP (the OAuth `mcp.figma.com` server — no token, no Desktop Bridge, no live selection). Try a FILE-LEVEL read of the variable collection AND the styles through it FIRST.",
    "2. Only if no remote Figma MCP is available, try a local one (figma-console / Desktop Bridge). If a diagnostic/status tool exists (figma_diagnose, figma_get_status), you may call it.",
    "3. Never rely on a live layer selection — use file-level reads that don't require selecting a node. Then classify the outcome.",
    "",
    "Reply with ONLY a single-line minified JSON object as your FINAL message, nothing before or after it:",
    '{"failureMode":"ok|token-expired|bridge-down|no-variables|not-configured|unknown","tokenValid":true|false,"bridgeConnected":true|false,"canReadVariablesAndStyles":true|false,"variableCount":<int>,"styleCount":<int>,"detail":"<one short sentence>"}',
    "",
    "Classification rules (judge by the BEST available path — a working remote MCP wins):",
    "- If ANY available Figma MCP (preferably the remote one) reads variables AND styles → \"ok\", even when a local figma-console Desktop Bridge is down — that legacy path is optional.",
    "- Only if NO path can read: a 401/403/expired/unauthorized/invalid-token from the Figma REST API → \"token-expired\"; 'Desktop Bridge not connected'/'plugin not running'/connection refused/ECONNREFUSED → \"bridge-down\"; no Figma MCP configured at all → \"not-configured\".",
    "- A path reads but returns zero variables/styles for another reason → \"no-variables\".",
  ].join("\n");
}

/** The command that connects the recommended (OAuth, token-free) Figma MCP. */
export const REMOTE_FIGMA_MCP_CMD = "claude mcp add --transport http figma https://mcp.figma.com/mcp";
/** Recommend the official OAuth server — no token, no Desktop Bridge, no selection. */
const REMOTE_MCP_HINT = `Easiest fix: use the official Figma MCP (OAuth — no token, no Desktop Bridge). Run \`${REMOTE_FIGMA_MCP_CMD}\`, then \`/mcp\` → Authenticate.`;

const MESSAGES: Record<FigmaHealthMode, (v: number, s: number, detail: string) => string> = {
  ok: (v, s) =>
    `Figma connection healthy — read ${v} variable${v === 1 ? "" : "s"} and ${s} style${s === 1 ? "" : "s"}. Safe to re-run the scan.`,
  // token-expired + bridge-down are both the LEGACY figma-console path breaking —
  // lead with the OAuth-MCP switch, keep the figma-console fix as a fallback.
  "token-expired": () =>
    `Your Figma token expired (401/403) on the legacy figma-console path. ${REMOTE_MCP_HINT} Or, to keep figma-console: refresh the token in Settings → Figma API token.`,
  "bridge-down": () =>
    `The legacy figma-console Desktop Bridge isn't connected. ${REMOTE_MCP_HINT} Or, to keep figma-console: open its Desktop Bridge plugin in Figma Desktop.`,
  "not-configured": () =>
    `No Figma MCP is connected to Claude Code. ${REMOTE_MCP_HINT}`,
  "no-variables": (_v, _s, detail) =>
    `The Figma connection responded but read no variables or styles. ${detail}`.trim(),
  unknown: (_v, _s, detail) =>
    `Couldn't determine the Figma connection health. ${detail}`.trim(),
};

/**
 * Normalize the engine's raw verdict object into a `FigmaHealth`. Pure and
 * defensive — trusts `failureMode` but tolerates missing/garbled fields.
 */
export function classifyFigmaHealth(raw: unknown): FigmaHealth {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parsedMode = figmaHealthModeSchema.safeParse(r.failureMode);
  const mode: FigmaHealthMode = parsedMode.success ? parsedMode.data : "unknown";
  const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const variableCount = num(r.variableCount);
  const styleCount = num(r.styleCount);
  const detail = typeof r.detail === "string" ? r.detail : "";
  return {
    mode,
    // Derive booleans consistently from the mode so the UI can trust them.
    tokenValid: typeof r.tokenValid === "boolean" ? r.tokenValid : mode !== "token-expired",
    bridgeConnected:
      typeof r.bridgeConnected === "boolean" ? r.bridgeConnected : mode !== "bridge-down",
    canRead: mode === "ok",
    variableCount,
    styleCount,
    message: MESSAGES[mode](variableCount, styleCount, detail),
    detail,
  };
}

/** Pull the verdict JSON out of a `claude -p --output-format json` result. */
export function extractVerdict(out: string): unknown | null {
  if (!out) return null;
  let text = out;
  // `--output-format json` wraps the run in an envelope whose `result` holds the
  // final assistant message; fall back to scanning the raw output otherwise.
  try {
    const env = JSON.parse(out) as { result?: unknown };
    if (env && typeof env.result === "string") text = env.result;
  } catch {
    /* not an envelope — scan the raw text */
  }
  const m = text.match(/\{[^{}]*"failureMode"[\s\S]*?\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Run the diagnostic against the user's Figma MCP and return a classified
 * health result. Read-only: bypasses permission prompts (so the MCP calls run
 * non-interactively) but the prompt forbids any modification.
 */
export async function checkFigmaHealth(opts: {
  projectPath: string;
  figmaFileUrl?: string;
}): Promise<FigmaHealth> {
  let url = opts.figmaFileUrl;
  if (!url) {
    const cfg = await readProjectConfig(opts.projectPath);
    url = cfg?.figmaFileUrl || undefined;
  }
  const r = await execFileSafe(
    "claude",
    [
      "-p",
      figmaHealthPrompt(url),
      "--output-format",
      "json",
      // Mechanical (call a tool, classify) → route to a cheaper model than the
      // default so a connection check doesn't cost an Opus run.
      "--model",
      "sonnet",
      "--dangerously-skip-permissions",
    ],
    { cwd: opts.projectPath, timeoutMs: 120_000 },
  );
  if (r.spawnError) {
    return classifyFigmaHealth({
      failureMode: "unknown",
      detail: "Couldn't run the Claude Code diagnostic — is `claude` installed and logged in?",
    });
  }
  if (r.timedOut) {
    return classifyFigmaHealth({ failureMode: "unknown", detail: "The Figma diagnostic timed out." });
  }
  const verdict = extractVerdict(r.stdout) ?? extractVerdict(r.stderr);
  return classifyFigmaHealth(
    verdict ?? { failureMode: "unknown", detail: (r.stdout || r.stderr || "no output").trim().slice(-200) },
  );
}
