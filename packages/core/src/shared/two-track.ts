/**
 * Two-track design-system build (OpenSpec change: light-design-system, task 4.2). Both tracks build to the
 * SAME contract over ONE Figma read: the fast LIGHT track emits framework-free stand-ins first (the palette
 * lights up as files land), then the BACKGROUND framework track builds the real components sequentially by
 * the 7-step cycle. Identity converges by construction (same names/variants/props); only visuals are
 * eventually-consistent (closed by harvest). This is a single background agent run so the one-read,
 * light-first ordering is guaranteed — not two independent passes that would each re-read Figma.
 *
 * Pure: composes the light stand-in prompt (`buildLightStandInPrompt`) with the framework-track section.
 * The renderer dispatches it via the agent-run machinery; VortSpec never calls Figma directly.
 */
import { buildLightStandInPrompt, type StandInTarget } from "./light-standin";

/** Order components by tier so the framework track builds atoms → molecules → organisms. */
const TIER_ORDER: Record<string, number> = { atom: 0, molecule: 1, organism: 2 };

export interface TwoTrackTarget extends StandInTarget {
  /** Atomic tier (drives framework build order). Absent → treated last. */
  tier?: string;
}

/**
 * Build the two-track prompt: the light stand-in pass verbatim (so track 1 is identical to the standalone
 * "Generate previews" flow), then a framework-track pass that reuses the SAME reads to build real
 * components in atomic order, flipping each to framework-ready as it lands + is harvested.
 */
export function buildTwoTrackBuildPrompt(targets: TwoTrackTarget[]): string {
  const ordered = [...targets].sort((a, b) => (TIER_ORDER[a.tier ?? ""] ?? 3) - (TIER_ORDER[b.tier ?? ""] ?? 3));
  const buildList = ordered
    .map((t) => `- ${t.name}${t.tier ? ` (${t.tier})` : ""} · variants: ${t.variants.length ? t.variants.join(", ") : "default"}`)
    .join("\n");

  return [
    "BUILD THE DESIGN SYSTEM IN TWO TRACKS over ONE Figma read per node. This is a single run so the",
    "ordering is guaranteed: the LIGHT track emits first (the palette is usable immediately), then the",
    "FRAMEWORK track builds the real components — both to the SAME contract, so their identities converge.",
    "",
    "══════════════════════════════════════════════════════════════════════",
    "TRACK 1 — LIGHT (do this FIRST, completely, before any framework code):",
    "══════════════════════════════════════════════════════════════════════",
    "",
    buildLightStandInPrompt(targets),
    "",
    "══════════════════════════════════════════════════════════════════════",
    "TRACK 2 — FRAMEWORK (only AFTER every light stand-in above is written):",
    "══════════════════════════════════════════════════════════════════════",
    "",
    "Now build the REAL framework components, REUSING the Figma reads you already did in Track 1 (do NOT",
    "re-read the same nodes). Read `.sdd-de/project.yaml` for the framework/language/styling and follow the",
    "project's component standards. Build in ATOMIC ORDER (atoms → molecules → organisms), one component at",
    "a time, each via the 7-step cycle:",
    "1. Build the component from its contract identity — the SAME name, variants, and props the light",
    "   stand-in used (identity MUST match the contract; do not rename or drop variants).",
    "2. Follow the project standards: CVA variants in a `.variants.ts`, a `cn()` merge, `forwardRef`, and",
    "   EVERY color/spacing/radius/type value referencing a design token (no hardcoded values).",
    "3. Once it exists AND its story renders, HARVEST its real render back over the light stand-in so the",
    "   palette preview becomes the true component output — the component flips to `framework-ready`.",
    "",
    "Components to build (atomic order):",
    buildList,
    "",
    "The light shelf stays usable throughout; each framework component converges to its light stand-in by",
    "construction. End with the components built + harvested and the readiness of each.",
  ].join("\n");
}
