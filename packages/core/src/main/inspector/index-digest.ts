import type { AgentRunOptions } from "@vortspec/core/run-events";
import { getInspectorComponents } from "./component-reader";
import { getInspectorTokens } from "./token-parser";

/**
 * The design-system index digest (Plan B3): a compact, authoritative summary of the
 * project's components and tokens, prepended to a run's system prompt so the agent
 * edits from the map instead of grepping/reading to rediscover it. Sourced from the
 * B2 scan cache, so building it is near-free. Terse by design — every line is one fact
 * the agent would otherwise spend exploration tokens to learn.
 */
export async function buildIndexDigest(projectPath: string): Promise<string> {
  const [comps, toks] = await Promise.all([
    getInspectorComponents(projectPath).catch(() => null),
    getInspectorTokens(projectPath).catch(() => null),
  ]);
  const components = comps?.components ?? [];
  const tokens = toks?.tokens ?? [];
  if (components.length === 0 && tokens.length === 0) return "";

  const lines: string[] = [
    "# Design-system index (VortSpec, authoritative)",
    "Use these existing components and tokens; do not re-scan the codebase to rediscover them, and do not hardcode values that a token already names.",
  ];

  if (components.length) {
    lines.push("", `## Components (${components.length}) — name [level] · file · deps · figma`);
    for (const c of components) {
      const bits = [c.file ?? "(unbuilt)"];
      if (c.dependsOn?.length) bits.push(`deps:${c.dependsOn.join(",")}`);
      if (c.figmaKey) bits.push(`figma:${c.figmaKey}`);
      else if (c.figmaBacked) bits.push("figma:yes");
      lines.push(`- ${c.name}${c.level ? ` [${c.level}]` : ""} · ${bits.join(" · ")}`);
    }
  }

  if (tokens.length) {
    lines.push("", `## Tokens (${tokens.length}) — name = value [figma:variableKey]`);
    for (const t of tokens) {
      const fig = t.figmaPath ? ` [figma:${t.figmaPath}]` : "";
      lines.push(`- --${t.name} = ${t.resolvedValue}${fig}`);
    }
  }

  return lines.join("\n");
}

/**
 * Return `opts` with the index digest prepended to `--append-system-prompt` when the
 * run asked to be grounded (`groundWithIndex`). A no-op otherwise, and a best-effort
 * addition — a failure to build the digest never blocks the run.
 */
export async function groundOptions(opts: AgentRunOptions): Promise<AgentRunOptions> {
  if (!opts.groundWithIndex) return opts;
  const digest = await buildIndexDigest(opts.cwd).catch(() => "");
  if (!digest) return opts;
  const appendSystemPrompt = opts.appendSystemPrompt ? `${digest}\n\n${opts.appendSystemPrompt}` : digest;
  return { ...opts, appendSystemPrompt };
}
