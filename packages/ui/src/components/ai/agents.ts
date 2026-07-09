/**
 * Per-conversation **agents**. An agent is a preset over the run options Claude
 * already accepts — a system prompt, a model, and a toolset — so different
 * conversation tabs can behave as a builder, a reviewer, an architect, etc. The
 * picker offers both VortSpec **custom presets** (shipped defaults + any from the
 * user's profile) and the session's real Claude Code **subagents** (from `init`).
 * Headless `-p` can't spawn as a subagent, so a subagent is expressed as an
 * instruction ("act as the <name> subagent") — honest about the limitation.
 */

export const READ_TOOLS = ["Read", "Grep", "Glob"];
export const MODIFY_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

export interface Agent {
  id: string;
  label: string;
  source: "preset" | "subagent";
  description?: string;
  /** Appended to the run's system prompt to shape the agent's behaviour. */
  systemPrompt?: string;
  /** Optional model alias (`--model`) the agent defaults to. */
  model?: string;
  /** Optional allow-list override; falls back to the dock's read/modify default. */
  allowedTools?: string[];
}

/** Shipped default presets (users can add more via profile prefs). */
export const DEFAULT_PRESETS: Agent[] = [
  {
    id: "build",
    label: "Build",
    source: "preset",
    description: "Implements changes directly",
    systemPrompt:
      "You may edit files to implement changes directly. Keep edits focused, token-referenced, and matching the surrounding style.",
    allowedTools: MODIFY_TOOLS,
  },
  {
    id: "yolo",
    label: "YOLO",
    source: "preset",
    description: "Acts autonomously — no questions",
    systemPrompt:
      "Operate fully autonomously: do NOT ask for permission or clarification. Make reasonable assumptions, proceed directly, edit files as needed, and only stop if genuinely blocked. Prefer action over questions.",
    allowedTools: MODIFY_TOOLS,
  },
  {
    id: "review",
    label: "Review",
    source: "preset",
    description: "Reviews code; never edits",
    systemPrompt:
      "Act as a meticulous code reviewer: surface bugs, risks, and unclear code, and suggest concrete improvements. Do NOT edit files.",
    allowedTools: READ_TOOLS,
  },
  {
    id: "plan",
    label: "Plan",
    source: "preset",
    description: "Plans before coding",
    systemPrompt:
      "Act as a software architect: produce a short, concrete plan or spec before any implementation. Do NOT edit files.",
    allowedTools: READ_TOOLS,
  },
];

/** The default agent a new conversation starts with. */
export const DEFAULT_AGENT = DEFAULT_PRESETS[0];

/** Turn the session's subagent names (from `init.agents`) into pickable agents. */
export function subagentAgents(names: string[]): Agent[] {
  return names.map((n) => ({
    id: `subagent:${n}`,
    label: n,
    source: "subagent" as const,
    description: "Claude Code subagent",
    systemPrompt: `Act as the "${n}" subagent for this conversation.`,
  }));
}

/** The full pickable list: presets (defaults + user) then the session's subagents. */
export function buildAgentList(sessionAgents: string[] | undefined, presets?: Agent[]): Agent[] {
  return [...(presets ?? DEFAULT_PRESETS), ...subagentAgents(sessionAgents ?? [])];
}
