/**
 * The prompt that turns a hand-drawn sketch into a design-system-grounded component (see
 * docs/draw-to-component-graph.md). Pure string builder: it combines a base instruction (read the
 * sketch image, ground in the project's design system, emit a framework-free light component marked
 * data-component) with the graph-derived grounding block from `renderSubgraphForPrompt`.
 *
 * The Draw window runs this via the normal agent machinery with the sketch PNG attached; the produced
 * component lands as a light page the Playground already knows how to preview. Framework code is
 * generated LATER by the existing convert step — same light-first contract as buildLightPagePrompt.
 */

export interface DrawGenerateOptions {
  /** Component/page name (slug) — the agent writes to this light page and marks data-component with it. */
  name: string;
  /** Project-relative output path for the light page, e.g. `.vortspec/light-pages/<name>.html`. */
  outputPath: string;
  /** The sketch's label (what the user says it is). */
  label: string;
  /** Optional one-line note refining the sketch. */
  note?: string;
  /** Absolute path to the exported sketch PNG — the agent Reads it as the visual intent. */
  pngPath: string;
  /** Whether this evolves an existing component (customize) or creates a new one. */
  intent?: "create-new" | "customize-existing";
  /** The graph-derived grounding block from renderSubgraphForPrompt (references, tokens, prior output). */
  subgraphBlock?: string;
}

export function buildDrawGeneratePrompt(opts: DrawGenerateOptions): string {
  const lines: string[] = [];
  const verb = opts.intent === "customize-existing" ? "CUSTOMIZE an existing" : "GENERATE a";

  lines.push(`${verb} design-system component from a HAND-DRAWN SKETCH. This task is light-first — do NOT`);
  lines.push("scaffold a framework app, build React components, or run the 7-step cycle; the framework version");
  lines.push("is generated LATER by a separate convert step.");
  lines.push("");
  lines.push(`The sketch image is at: ${opts.pngPath}`);
  lines.push("READ that image FIRST (the Read tool) — it is the primary visual intent for the component.");
  lines.push(`Label: "${opts.label.trim() || "(untitled sketch)"}"`);
  if (opts.note && opts.note.trim()) lines.push(`Note: ${opts.note.trim()}`);
  lines.push("");
  lines.push("GROUND IT IN THE PROJECT'S DESIGN SYSTEM — this is the whole point; the output must NOT be generic:");
  lines.push("- Read `designer.md` at the project root and the stand-ins in `.vortspec/light-html/` — they are the");
  lines.push("  component library. REUSE those components; do not invent off-system look-alikes.");
  lines.push("- Reference ONLY existing design tokens (from the project's token file / designer.md). Never emit a");
  lines.push("  raw hex or px value where a token applies.");
  lines.push("");

  if (opts.subgraphBlock && opts.subgraphBlock.trim()) {
    lines.push(opts.subgraphBlock.trim());
    lines.push("");
  }

  lines.push("OUTPUT: framework-free HTML/CSS (and a small vanilla-JS island ONLY if the sketch needs client");
  lines.push("behavior). Mark each reused design-system component instance with `data-component=\"<ComponentName>\"`");
  lines.push("on its root element, using the exact names from `designer.md`. It MUST NOT contain: `import`, JSX,");
  lines.push("`.variants.ts`, `@/…` module paths, `cva(`/`cn(`, `.tsx`/`.jsx`, or a Storybook URL.");
  lines.push(`WRITE the result to \`${opts.outputPath}\` (create the dir). This file is your ONLY output — the`);
  lines.push("Playground previews it live; do not scaffold or modify anything else.");

  return lines.join("\n");
}
