/**
 * Render a `SubgraphSlice` (from `selectSubgraph`, draw-graph.ts) into the grounding prompt block
 * a caller appends to `buildComposePrompt` (compose-run.ts) when a generation originates from a
 * Draw-tool sketch. See docs/draw-to-component-graph.md § "selectSubgraph — the grounding contract".
 *
 * PURE + framework-free: `SubgraphSlice` in, string out. No fs, no app imports, no Date.now()/random.
 * The slice carries REFS, not blobs (pngRef/outputRef/stand-in names). A thin main-process step
 * hydrates those refs from disk and passes the content in via `hydrated`; this module only stitches
 * text. Enforcement baked into the block: reference ONLY the listed tokens; reuse the listed
 * components; when `customizeTarget` is present, EDIT its output rather than regenerate.
 */

import type { SubgraphSlice } from "./draw-graph";

/**
 * File content the pure slice only referenced, resolved by the caller from disk. Every field is
 * optional — the block degrades to ref-only guidance when content is not supplied.
 */
export interface SubgraphHydration {
  /** Stand-in HTML for reference components, keyed by component name (from their light stand-ins). */
  referenceStandIns?: Record<string, string>;
  /** Prior-version output HTML for the iterate loop, keyed by component name (from `outputRef`). */
  priorHtml?: Record<string, string>;
  /** The customize target's current output HTML (from `customizeTarget.outputRef`), to EDIT in place. */
  customizeHtml?: string;
}

/** Trim + collapse a possibly-huge hydrated blob so one part can't blow the prompt budget. */
function clip(html: string, max = 6000): string {
  const s = html.trim();
  return s.length > max ? `${s.slice(0, max)}\n… (truncated)` : s;
}

/**
 * Turn a `SubgraphSlice` (+ optional hydrated file content) into the grounding text block appended
 * to `buildComposePrompt`, alongside the sketch PNG attachment. Pure string builder.
 */
export function renderSubgraphForPrompt(slice: SubgraphSlice, hydrated?: SubgraphHydration): string {
  const h = hydrated ?? {};
  const lines: string[] = [];

  // ── Header + sketch identity ────────────────────────────────────────────────
  lines.push("=== Draw grounding (design-system slice for this sketch) ===");
  const label = slice.sketch.label.trim() || "(untitled sketch)";
  lines.push(`Sketch: "${label}"`);
  if (slice.sketch.note && slice.sketch.note.trim()) {
    lines.push(`Note: ${slice.sketch.note.trim()}`);
  }
  lines.push("The hand-drawn sketch image is attached to this run separately — Read it as the primary visual intent; the text below is the design-system context that grounds it.");
  lines.push("");

  // ── Intent ──────────────────────────────────────────────────────────────────
  if (slice.intent === "customize-existing") {
    const target = slice.customizeTarget;
    const targetName = target?.component ?? "the referenced component";
    lines.push(`Intent: CUSTOMIZE-EXISTING — you are evolving the existing component "${targetName}"${
      target?.latestVersion != null ? ` (currently v${target.latestVersion})` : ""
    }.`);
    lines.push(`Do NOT regenerate from scratch. EDIT the provided current output of "${targetName}" below to match the sketch, preserving everything the sketch does not change.`);
    if (h.customizeHtml && h.customizeHtml.trim()) {
      lines.push(`Current output of "${targetName}" — EDIT THIS:`);
      lines.push("```html");
      lines.push(clip(h.customizeHtml));
      lines.push("```");
    } else if (target?.outputRef) {
      lines.push(`Current output is at: ${target.outputRef} — edit that existing implementation rather than starting over.`);
    }
  } else {
    lines.push("Intent: CREATE-NEW — produce a new component from the sketch, reusing the design-system parts below wherever they fit.");
  }
  lines.push("");

  // ── Reference components (REUSE) ────────────────────────────────────────────
  if (slice.referenceComponents.length) {
    lines.push("Reference components — REUSE these (do not reinvent them); the user picked them to ground this sketch:");
    for (const ref of slice.referenceComponents) {
      const tier = ref.tier ? ` [${ref.tier}]` : "";
      lines.push(`- ${ref.name}${tier} — role: ${ref.role}`);
      const standIn = h.referenceStandIns?.[ref.name];
      if (standIn && standIn.trim()) {
        lines.push(`  stand-in HTML for ${ref.name}:`);
        lines.push("  ```html");
        for (const l of clip(standIn, 3000).split("\n")) lines.push(`  ${l}`);
        lines.push("  ```");
      }
    }
    lines.push("");
  }

  // ── Composed parts ──────────────────────────────────────────────────────────
  if (slice.composedFrom.length) {
    lines.push("Composed from — these reference components are built out of these sub-parts (reuse the sub-parts too):");
    for (const c of slice.composedFrom) {
      lines.push(`- ${c.parent} → ${c.children.join(", ")}`);
    }
    lines.push("");
  }

  // ── Prior versions (iterate loop) ───────────────────────────────────────────
  if (slice.priorVersions.length) {
    lines.push("Prior versions this sketch already produced — EDIT the prior output rather than restarting, so the result is an evolution:");
    for (const pv of slice.priorVersions) {
      lines.push(`- ${pv.component} v${pv.version}${pv.outputRef ? ` (${pv.outputRef})` : ""}`);
      const prior = h.priorHtml?.[pv.component];
      if (prior && prior.trim()) {
        lines.push(`  prior output of ${pv.component} v${pv.version}:`);
        lines.push("  ```html");
        for (const l of clip(prior).split("\n")) lines.push(`  ${l}`);
        lines.push("  ```");
      }
    }
    lines.push("");
  }

  // ── Siblings (nudge toward existing atoms) ──────────────────────────────────
  if (slice.siblings.length) {
    lines.push(`Same-tier components that already exist (prefer these over inventing new ones): ${slice.siblings.join(", ")}.`);
    lines.push("");
  }

  // ── Tokens — reference ONLY these ───────────────────────────────────────────
  if (slice.tokens.length) {
    lines.push("Design tokens — reference ONLY these tokens by name; do NOT introduce a raw hex or px value where one of these applies:");
    for (const t of slice.tokens) {
      lines.push(`- ${t.name}: ${t.value ?? "(value resolved from the token index)"}`);
    }
    lines.push("");
  } else {
    lines.push("This sketch has no token edges yet — ground values in the project's core design-system tokens (supplied elsewhere in this prompt); do NOT hardcode raw hex or px.");
    lines.push("");
  }

  // ── Truncation note ─────────────────────────────────────────────────────────
  if (slice.budgets.truncated) {
    lines.push(`NOTE: this slice was TRUNCATED to fit the grounding budget (components ${slice.budgets.components}, tokens ${slice.budgets.tokens}). Some related components or tokens were omitted — reuse what is listed and do not assume the list is exhaustive.`);
  }

  return lines.join("\n").trimEnd();
}
