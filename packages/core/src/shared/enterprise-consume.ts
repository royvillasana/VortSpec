/**
 * Connect Enterprise Design System (OpenSpec change: connect-enterprise-design-system) — the CONSUME
 * model. The client already owns a coded component library, its Storybook, design tokens, and a
 * knowledge base; VortSpec REFERENCES them (an index of pointers) and VALIDATES they're usable, rather
 * than extracting or rebuilding. The ONLY artifact it creates is the framework-free light stand-in
 * layer the Playground composes against (produced by the snapshot; see storybook-consumption).
 *
 * This module is PURE: the readiness analysis, the index/prompt shapes, and the Foundation prompt
 * builder. The fs/agent wiring is layered on top.
 */

/** A single connected asset's usability. `ok` = usable, `gap` = present but incomplete, `missing` = not connected. */
export interface AssetCheck {
  status: "ok" | "gap" | "missing";
  detail: string;
}

/** Per-component readiness — a component with no Storybook story can't be harvested faithfully. */
export interface ComponentCheck {
  name: string;
  hasStory: boolean;
  importable: boolean;
  /** `harvested` = a real render snapshot; `placeholder` = a low-fidelity stand-in (no story). */
  fidelity: "harvested" | "placeholder";
}

/** One entry of the enterprise `components.json` — a POINTER to the client's real component, never a copy. */
export interface EnterpriseComponentEntry {
  name: string;
  /** Module the real component is imported from (their component dir or published package). */
  importPath: string;
  /** The named export to import (e.g. `Button`). */
  export: string;
  /** The Storybook story id whose render is harvested into the light stand-in (absent → placeholder). */
  storyId?: string;
  tier?: "atom" | "molecule" | "organism";
}

export interface EnterpriseReadinessInput {
  /** The client's tokens (parsed from their file, or read off the Storybook `:root`). */
  tokens: { name: string; resolvedValue: string }[];
  /** Component values that resolved to NO token (via the token resolver) — a fidelity gap, not a copy. */
  unresolvedValues?: string[];
  /** Detected components with whether each is importable and has a Storybook story. */
  components: { name: string; hasStory: boolean; importable: boolean }[];
  /** The connected knowledge base, when one was configured. */
  knowledgeBase?: { connected: boolean; reachable: boolean } | null;
}

export interface EnterpriseReadiness {
  tokens: AssetCheck;
  components: AssetCheck;
  componentDetail: ComponentCheck[];
  knowledgeBase: AssetCheck;
  /** True when nothing blocks consuming the design system (gaps are fine; missing tokens/components are not). */
  usable: boolean;
}

/**
 * Analyze whether a connected enterprise design system is usable for our work (validate, NOT extract).
 * Gaps (some components without a story, some values not yet mapped) are surfaced but don't block —
 * only a total absence of tokens or components does. Pure: the fs/agent probes feed this.
 */
export function analyzeEnterpriseReadiness(input: EnterpriseReadinessInput): EnterpriseReadiness {
  const withValue = input.tokens.filter((t) => t.resolvedValue.trim().length > 0);
  const unresolved = input.unresolvedValues ?? [];
  const tokens: AssetCheck =
    input.tokens.length === 0
      ? { status: "missing", detail: "No tokens found — connect a token file or a Storybook that exposes CSS variables." }
      : unresolved.length > 0
        ? { status: "gap", detail: `${withValue.length} tokens resolve; ${unresolved.length} component value(s) map to no token.` }
        : { status: "ok", detail: `${withValue.length} tokens resolve; every bound value maps to a token.` };

  const componentDetail: ComponentCheck[] = input.components.map((c) => ({
    name: c.name,
    hasStory: c.hasStory,
    importable: c.importable,
    fidelity: c.hasStory ? "harvested" : "placeholder",
  }));
  const noStory = componentDetail.filter((c) => !c.hasStory);
  const components: AssetCheck =
    input.components.length === 0
      ? { status: "missing", detail: "No components detected in the connected library/Storybook." }
      : noStory.length > 0
        ? {
            status: "gap",
            detail: `${input.components.length - noStory.length}/${input.components.length} have a story; ${noStory.length} will use a placeholder stand-in.`,
          }
        : { status: "ok", detail: `All ${input.components.length} components have a story.` };

  const kb = input.knowledgeBase;
  const knowledgeBase: AssetCheck =
    !kb || !kb.connected
      ? { status: "missing", detail: "No knowledge base connected (optional)." }
      : kb.reachable
        ? { status: "ok", detail: "Knowledge base reachable." }
        : { status: "gap", detail: "Knowledge base connected but not reachable — check the URL/endpoint or auth." };

  const usable = tokens.status !== "missing" && components.status !== "missing";
  return { tokens, components, componentDetail, knowledgeBase, usable };
}

/** The connect settings the enterprise Foundation reads from `project.yaml`. */
export interface EnterpriseConnectConfig {
  storybookSourceKind?: string; // url | static | repo
  storybookSource?: string;
  enterpriseRepoUrl?: string;
  knowledgeBaseKind?: string; // docs-repo | site | mcp
  knowledgeBase?: string;
  componentDir?: string;
  tokenFile?: string;
}

/**
 * Build the enterprise Foundation prompt: CONSUME the client's existing design system — validate it's
 * usable, INDEX it (pointers, not copies), and project the light layer — never extract/build/re-derive.
 * The snapshot step (harvest their Storybook → light stand-ins) is detailed by storybook-consumption.
 */
export function buildEnterpriseFoundationPrompt(cfg: EnterpriseConnectConfig): string {
  const sb = cfg.storybookSource ? `${cfg.storybookSourceKind ?? "url"} → ${cfg.storybookSource}` : "(not set)";
  return [
    "CONNECT AN ENTERPRISE DESIGN SYSTEM. The client already owns a coded component library, its Storybook,",
    "design tokens, and a knowledge base. CONSUME them — reference and validate what exists. Do NOT extract",
    "or re-derive tokens, do NOT build or rebuild components (no 7-step cycle), do NOT run /provision-library,",
    "and do NOT install a VortSpec Storybook. Their design system is the single source of truth; never copy it.",
    "",
    `Connected: Storybook = ${sb}${cfg.enterpriseRepoUrl ? `; repo = ${cfg.enterpriseRepoUrl}` : ""}${
      cfg.knowledgeBase ? `; knowledge base = ${cfg.knowledgeBaseKind ?? "docs-repo"} → ${cfg.knowledgeBase}` : ""
    }.`,
    "",
    "1. VALIDATE (a readiness report, not extraction): confirm each connected asset is usable —",
    "   • Tokens: read their token file (and/or the Storybook preview `:root` custom properties); every value",
    "     resolves; each component's bound values map to a token (flag any that map to none — never hardcode).",
    "   • Components: the library imports/builds; each component has a Storybook story (flag any that don't —",
    "     they get a placeholder stand-in, lower fidelity).",
    "   • Knowledge base: a probe query answers (flag unreachable/unauthorized).",
    "",
    "2. INDEX, don't copy: write `.sdd-de/components.json` as POINTERS — for each component, its real import",
    "   path + named export + Storybook story id (and tier). Point `token_file` in `project.yaml` at their real",
    "   token file when present. NEVER author a competing token or component definition.",
    "",
    "3. PROJECT the light layer (the ONLY thing you create): snapshot their Storybook renders into",
    "   framework-free light stand-ins for the Playground (see the snapshot step). Read the token palette from",
    "   the Storybook `:root` custom properties (name + resolved value).",
    "",
    "End with the readiness report + the pointer index written, and the light stand-ins produced. Do not",
    "modify their source, their tokens, or their components.",
  ].join("\n");
}
