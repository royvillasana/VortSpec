import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSafe } from "../util/exec";
import type { FigmaTokenStatus } from "@vortspec/core/figma";

/**
 * Update the Figma personal-access token that the user's `figma-console` MCP
 * uses to read variables + styles — the token that expires with a 403 and
 * silently degrades extraction to guessing.
 *
 * Invariant #4 ("VortSpec stores no provider keys"): VortSpec keeps NO copy of
 * the token. It writes the user-supplied token straight into the user's own
 * Claude Code MCP config — where the token already lives — through the supported
 * `claude mcp` CLI (which handles config locking), and never persists or echoes
 * it back. The status only reports whether a token is present, never its value.
 */

interface McpServerSpec {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Locate a user-scope stdio MCP server that carries a Figma token env var. */
export function findFigmaTokenServer(
  config: unknown,
): { name: string; spec: McpServerSpec; envVar: string } | null {
  const servers = (config as { mcpServers?: Record<string, McpServerSpec> })?.mcpServers;
  if (!servers || typeof servers !== "object") return null;
  for (const [name, spec] of Object.entries(servers)) {
    const env = spec?.env ?? {};
    // Prefer an explicit Figma token env var; fall back to a figma-named server.
    const envVar =
      Object.keys(env).find((k) => /^FIGMA.*(TOKEN|KEY)$/i.test(k)) ??
      (/figma/i.test(name) || /figma/i.test(`${spec?.command ?? ""} ${(spec?.args ?? []).join(" ")}`)
        ? "FIGMA_ACCESS_TOKEN"
        : null);
    if (envVar) return { name, spec, envVar };
  }
  return null;
}

/** Derive the token status (present/absent) without exposing the value. */
export function figmaTokenStatusFrom(config: unknown): FigmaTokenStatus {
  const found = findFigmaTokenServer(config);
  if (!found) {
    return {
      configured: false,
      serverName: null,
      envVar: null,
      message: "No local Figma MCP (figma-console) is configured, so there's no token to update.",
    };
  }
  const value = found.spec.env?.[found.envVar];
  const present = typeof value === "string" && value.trim().length > 0;
  return {
    configured: present,
    serverName: found.name,
    envVar: found.envVar,
    message: present
      ? `A Figma token is set on “${found.name}” (${found.envVar}). Paste a new one to replace it.`
      : `“${found.name}” has no ${found.envVar} set. Paste a token to add it.`,
  };
}

/** Build the server spec JSON to re-add, swapping in the new token. */
export function buildUpdatedServerSpec(
  spec: McpServerSpec,
  envVar: string,
  token: string,
): McpServerSpec {
  return { ...spec, env: { ...(spec.env ?? {}), [envVar]: token } };
}

const CONFIG_PATH = (): string => join(homedir(), ".claude.json");

async function readClaudeConfig(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH(), "utf8"));
  } catch {
    return null;
  }
}

export async function getFigmaTokenStatus(): Promise<FigmaTokenStatus> {
  return figmaTokenStatusFrom(await readClaudeConfig());
}

/**
 * Write the user-supplied token into their Figma MCP config via the supported
 * CLI (remove → add-json). Non-destructive: on failure it restores the previous
 * spec. Returns a human result; never returns the token.
 */
export async function setFigmaToken(token: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = token.trim();
  if (trimmed.length < 8 || /\s/.test(trimmed)) {
    return { ok: false, message: "That doesn't look like a valid Figma token. Paste the full token." };
  }
  const config = await readClaudeConfig();
  const found = findFigmaTokenServer(config);
  if (!found) {
    return {
      ok: false,
      message:
        "Couldn't find a local Figma MCP to update. Add the figma-console MCP first, then set its token here.",
    };
  }
  const { name, spec, envVar } = found;
  const updated = buildUpdatedServerSpec(spec, envVar, trimmed);

  const rm = await execFileSafe("claude", ["mcp", "remove", name, "-s", "user"], { timeoutMs: 20_000 });
  if (rm.spawnError) return { ok: false, message: "Couldn't run `claude` to update the token — is it installed?" };

  const add = await execFileSafe(
    "claude",
    ["mcp", "add-json", name, JSON.stringify(updated), "-s", "user"],
    { timeoutMs: 20_000 },
  );
  if (add.code !== 0) {
    // Restore the previous spec so we never leave the server deleted.
    await execFileSafe("claude", ["mcp", "add-json", name, JSON.stringify(spec), "-s", "user"], {
      timeoutMs: 20_000,
    });
    return {
      ok: false,
      message: `Couldn't update the token (${(add.stderr || add.stdout || "unknown error").trim().slice(-160)}). Your previous token was restored.`,
    };
  }
  return {
    ok: true,
    message: `Figma token updated on “${name}”. Re-run the scan or the connection check — a fresh run picks up the new token.`,
  };
}
