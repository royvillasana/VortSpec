import { z } from "zod";
import type { InspectorComponent } from "./inspector";
import { SCAFFOLD_SENTINEL, scaffoldBegin, scaffoldEnd } from "./compose-scaffold";

/**
 * Composition-run contract (change: canvas-compose-and-preview-bar, §6).
 *
 * A composition run asks Claude Code to fill an insert slot with **compositions of
 * the project's own roster components** — never hand-authored markup — grounded in
 * the project's tokens and DESIGN.md. It returns at most three genuinely distinct
 * options, or an explicit "no component matches" that routes into extract-component.
 *
 * This module is the result contract (what the run must return) and the prompt
 * builder (how the roster + grounding become an instruction). The prompt builder
 * lives with `compose-scaffold` in spirit: the prompt tells the agent to wrap each
 * option in the markers that module defines, so write, cleanup, and the commit
 * guard all agree on the format.
 */

/** The ceiling on options. R2: 1–3, defaulting to 3 — a maximum, never a target. */
export const MAX_COMPOSE_OPTIONS = 3;

/**
 * One composed option — its provenance and the axis that makes it distinct.
 * Fields beyond the composition itself are best-effort: a real run's JSON varies,
 * and rejecting a whole result over a missing title helps no one. The cycler falls
 * back to the option's position. Options are keyed for accept by their position in
 * the array (which matches the 0-based scaffold markers), not this `index`.
 */
export const composeOptionSchema = z.object({
  /** Informational 0-based index the run reported (the array position is authoritative). */
  index: z.number().int().nonnegative().optional(),
  /** Short human title for the option cycler. */
  title: z.string().default(""),
  /** The distinct composition axis this option explores (Decision 8). */
  axis: z.string().default(""),
  /** Roster component names this option composes, for inspectable provenance. */
  componentsUsed: z.array(z.string()).default([]),
  /** One-line rationale shown beneath the option. */
  note: z.string().default(""),
});
export type ComposeOption = z.infer<typeof composeOptionSchema>;

/**
 * The run judged that no roster component fits the slot. Surfaced as an explicit
 * result that offers extraction — never papered over with hand-written markup.
 */
export const noComponentMatchSchema = z.object({
  reason: z.string().min(1),
  /** A suggested name for the component to extract (seeds the extract-component flow). */
  suggestedName: z.string().optional(),
});
export type NoComponentMatch = z.infer<typeof noComponentMatchSchema>;

/**
 * The run could not place the insertion and wrote nothing (§6.9): the anchor
 * matched more than one source location and it would not guess, or matched none.
 * Escalated as a human sentence — never a write to an arbitrary candidate.
 */
export const composeStoppedSchema = z.object({
  reason: z.string().min(1),
  /** Candidate source locations when the anchor was ambiguous (for the human message). */
  candidates: z.array(z.string()).default([]),
});
export type ComposeStopped = z.infer<typeof composeStoppedSchema>;

/**
 * The composition run's result. Exactly one of `options` (1–3 distinct) or
 * `noMatch` is meaningful; `fewerReason` explains a short set (R2) so the UI shows
 * the reason rather than an empty third slot.
 */
export const composeResultSchema = z
  .object({
    options: z.array(composeOptionSchema).max(MAX_COMPOSE_OPTIONS).default([]),
    /** Why fewer than the requested count were returned (R2). Null when the set is full. */
    fewerReason: z.string().nullable().default(null),
    /** Present when no roster component fits — mutually exclusive with real options. */
    noMatch: noComponentMatchSchema.nullable().default(null),
    /** Present when the run stopped without placing the insertion (ambiguous/not-found anchor). */
    stopped: composeStoppedSchema.nullable().default(null),
    /** The project-relative source file the run wrote the option scaffold into (accept strips it here). */
    writtenFile: z.string().nullable().default(null),
  })
  .refine((r) => r.noMatch !== null || r.stopped !== null || r.options.length > 0, {
    message: "a composition result must carry options, a no-component-match, or a stop reason",
  });
export type ComposeResult = z.infer<typeof composeResultSchema>;

// ── Prompt builder (§6.1, §6.2, §6.4) ────────────────────────────────

/** The slot the composition fills — normalized anchor + position, with the anchor's leading text. */
export interface ComposeSlot {
  /** The anchor element's label (component name or tag) for human reference. */
  anchorLabel: string;
  /** The anchor's leading text — the documented disambiguator; pass it whenever present. */
  anchorText: string | null;
  /** Insert before or after the anchor. */
  position: "before" | "after";
  /** The container's flow axis (drives how a composition should size itself). */
  axis: "row" | "column";
  /** The resolved source file for the slot, when the host could derive it (else null). */
  file: string | null;
}

/**
 * Where and how the composition goes in — the user's explicit placement choice,
 * replacing silent axis inference (change: canvas-live-structural-editing, §3).
 * `slotCount` is how many layout slots/items to create; it is NOT the AI option
 * count (`count`, 1–3) — the two are deliberately distinct quantities.
 */
export interface InsertSpec {
  placement: "into-existing" | "new-row" | "new-column";
  axis: "row" | "column";
  slotCount: number;
}

export interface ComposePromptInput {
  /** Opaque, marker-safe run id — the scaffold markers carry it (see compose-scaffold). */
  runId: string;
  /** The project's component roster (from `getInspectorComponents`). */
  roster: InspectorComponent[];
  /** Design token names in the project (the composition must reuse these, not literals). */
  tokens: string[];
  /** The DESIGN.md hand-off contents, when present. */
  designMd: string | null;
  slot: ComposeSlot;
  /** What the user wants in the slot — their typed description, or a component-pick directive. */
  intent: string;
  /**
   * Components the user explicitly picked to build from (the Components tab). When
   * present, the composition composes PRIMARILY from these; when empty, the whole
   * roster is fair game.
   */
  preferredComponents?: string[];
  /** The user's explicit placement + axis + slot count (overrides inference). */
  insertSpec?: InsertSpec;
  /** The placeholder's soft size hint (px) — guidance the composition may deviate from. */
  sizeHint?: { width?: number; height?: number };
  /** How many AI options to attempt (1–3, default 3). A ceiling — NOT the slot count. */
  count?: number;
}

/**
 * Whether the roster can support a composition run at all (§6.4). An empty roster
 * is the "no silent markup" signal — the host surfaces a next step instead of
 * letting the run degrade into hand-written markup.
 */
export function hasUsableRoster(roster: InspectorComponent[]): boolean {
  return roster.length > 0;
}

/** One roster line: name, level, description, variants, props, tokens, source file. */
function rosterLine(c: InspectorComponent): string {
  const parts = [`- ${c.name}${c.level ? ` (${c.level})` : ""}`];
  if (c.description) parts.push(`: ${c.description}`);
  const variants = c.variants?.length ? c.variants : c.props.map((p) => p.key);
  if (variants.length) parts.push(` — variants/props: ${variants.join(", ")}`);
  if (c.props.length) {
    const opts = c.props
      .filter((p) => p.options.length)
      .map((p) => `${p.key}=[${p.options.join("|")}]`);
    if (opts.length) parts.push(`; options: ${opts.join(", ")}`);
  }
  if (c.tokens.length) parts.push(`; tokens: ${c.tokens.slice(0, 8).join(", ")}`);
  if (c.file) parts.push(`; file: ${c.file}`);
  return parts.join("");
}

/**
 * The distinctness discipline (Decision 8), adapted from Impeccable's four-phase
 * procedure to our axes (which components / which variants / what composition).
 * Encoded in the prompt as first-class instructions, not an afterthought.
 */
const DISTINCTNESS_CLAUSE = [
  "Make the options genuinely distinct — this is the whole point of offering more than one:",
  "1. First read the existing identity from real values (the roster components, their variants, the project tokens). Do not invent an aesthetic vocabulary; base every choice on what the design system already is.",
  "2. Each option MUST differ along a DIFFERENT axis — e.g. which components it uses, which variants/props, or the layout/arrangement — not merely incidental values. Name that axis for each option.",
  "3. Prefer preserving the existing identity over departing from it. Three on-brand near-siblings are recoverable; an off-brand option is not.",
  "4. Squint test: if two options would read the same at a glance, drop one and return fewer — never pad the set with a near-duplicate.",
].join("\n");

/**
 * Build the composition-run prompt: roster-grounded, token-aware, distinctness-
 * disciplined, and instructed to write marker-delimited option scaffolds plus a
 * final JSON result matching `composeResultSchema`.
 *
 * Assumes a non-empty roster — callers gate on `hasUsableRoster` first (§6.4).
 */
export function buildComposePrompt(input: ComposePromptInput): string {
  const count = Math.max(1, Math.min(MAX_COMPOSE_OPTIONS, input.count ?? MAX_COMPOSE_OPTIONS));
  const { slot } = input;
  const sizeHint =
    input.sizeHint && (input.sizeHint.width || input.sizeHint.height)
      ? `The user sized the slot to roughly ${input.sizeHint.width ?? "auto"}×${input.sizeHint.height ?? "auto"}px. Treat this as a SOFT hint, not a constraint.`
      : "";

  // The user's explicit choice overrides the container's inferred axis.
  const spec = input.insertSpec;
  const axis = spec?.axis ?? slot.axis;
  const axisWord = axis === "row" ? "horizontal (row)" : "vertical (column)";
  const placementLine = spec
    ? spec.placement === "into-existing"
      ? `Insert as a ${axis} (the user chose this axis explicitly).${spec.slotCount > 1 ? ` Create ${spec.slotCount} items along it.` : ""}`
      : `Create a NEW ${spec.placement === "new-row" ? "row" : "column"} container with ${spec.slotCount} slot(s) at this position, laid out along the ${axis} axis, and place the composition inside it.`
    : "";

  const lines: string[] = [
    `Compose new UI for an insertion slot in this project, using ONLY the project's own components.`,
    "",
    `What the user wants here: ${input.intent.trim() || "(no description given — infer something sensible for this slot)"}`,
    "",
    `The slot: insert ${slot.position} the "${slot.anchorLabel}" element${
      slot.anchorText ? ` whose leading text is "${slot.anchorText.slice(0, 120)}"` : ""
    }, in a ${axisWord} flow.`,
    placementLine,
    slot.file ? `The slot resolves to source file: ${slot.file}.` : "",
    sizeHint,
    "",
    "Component roster — compose ONLY from these, choosing their variants/props:",
    ...input.roster.map(rosterLine),
    "",
    input.preferredComponents && input.preferredComponents.length
      ? `The user specifically chose these components to build this from: ${input.preferredComponents.join(", ")}. Compose PRIMARILY from them; reach for other roster components only if the intent genuinely needs one.`
      : "",
    "",
    input.tokens.length
      ? `Ground every value in the project's design tokens (${input.tokens.slice(0, 40).join(", ")}${
          input.tokens.length > 40 ? ", …" : ""
        }). Do NOT introduce a hardcoded hex or px value where a token exists.`
      : "Ground every value in the project's design tokens. Do NOT hardcode hex or px where a token exists.",
    input.designMd ? `\nDESIGN.md hand-off (follow it):\n${input.designMd.slice(0, 4000)}` : "",
    "",
    DISTINCTNESS_CLAUSE,
    "",
    `Return at most ${count} option(s) — 1 to ${count}. Fewer, with a reason, beats a padded near-duplicate. Never exceed ${MAX_COMPOSE_OPTIONS}.`,
    "",
    "If NO roster component fits this slot, do NOT hand-write markup. Instead return a no-component-match result naming why and a suggested component to extract.",
    "",
    "Placing the slot in source:",
    `- Find the exact spot in ${slot.file ?? "the source"} — the anchor element identified above (use its leading text to disambiguate between similar siblings).`,
    "- If the anchor matches MORE THAN ONE location and you cannot tell which, STOP and return a `stopped` result with the candidate locations — do NOT write to an arbitrary one.",
    "- If the anchor cannot be found at all, STOP and return a `stopped` result saying so — write nothing.",
    "- Never write into a generated, build-output, or git-ignored file; if the slot resolves into one, STOP and return a `stopped` result explaining which file and why. (An untracked but non-ignored file — normal uncommitted source — is fine to write into.)",
    "",
    "Write EACH option into the source at the slot, wrapped in its own markers so the preview can be swept deterministically. For option N (0-based), wrap it exactly:",
    `  ${scaffoldBegin(input.runId, 0).replace("option=0", "option=N")}`,
    `  …option N's JSX, composed from roster components…`,
    `  ${scaffoldEnd(input.runId, 0).replace("option=0", "option=N")}`,
    `Every marker MUST contain the literal run id "${input.runId}". The dev server will hot-reload each option in place.`,
    "",
    "Also add a `data-vs-option=\"N\"` attribute to each option's root element so the canvas can preview one option at a time.",
    "For EACH roster component you place, add a `data-component=\"<ComponentName>\"` attribute on its usage (e.g. `<Card data-component=\"Card\" … />`) so the inspector recognizes it as that component afterwards, not as hand-written markup. (Components that forward props will pass it through to the DOM.)",
    "",
    "Finally, output a single fenced JSON block (```json) as the LAST thing you emit, matching this shape exactly:",
    '{ "options": [ { "index": 0, "title": "…", "axis": "which axis makes it distinct", "componentsUsed": ["Card", …], "note": "one line" } ], "fewerReason": null | "why fewer than requested", "noMatch": null | { "reason": "…", "suggestedName": "…" }, "stopped": null | { "reason": "why you could not place the insertion", "candidates": ["file:line", …] }, "writtenFile": "the project-relative file you wrote the options into, or null if you wrote nothing" }',
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/** Extract and validate the composition result from a run's final message text (§6.3, §7). */
export function parseComposeResult(text: string): ComposeResult | null {
  // Prefer a fenced ```json block; fall back to the last balanced object.
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  const candidate = fenced ?? lastJsonObject(text);
  if (!candidate) return null;
  try {
    return composeResultSchema.parse(JSON.parse(candidate));
  } catch {
    return null;
  }
}

/** The last top-level {...} object in a string (a lenient fallback when no fence is present). */
function lastJsonObject(text: string): string | null {
  const end = text.lastIndexOf("}");
  if (end < 0) return null;
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      depth--;
      if (depth === 0) return text.slice(i, end + 1);
    }
  }
  return null;
}

/** Re-exported so callers building the scaffold grep share one sentinel. */
export { SCAFFOLD_SENTINEL };

