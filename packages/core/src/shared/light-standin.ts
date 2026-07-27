/**
 * Figma-derived light stand-ins (OpenSpec change: light-design-system, task 3.1). VortSpec-owned
 * orchestration that REUSES the existing Figma-read recipe (resolve node from `components.json`'s
 * `figmaNodeId`/`componentKey` → `get_design_context`, the same read `generate-artifacts`/`visual-verify`
 * use) to emit a framework-free HTML stand-in per component/variant. Same read, different output — no
 * new Figma reader, and VortSpec never calls Figma directly (the agent does, via the user's MCP).
 *
 * This module is PURE: it builds the agent prompt and defines the on-disk contract. Running the agent
 * + collecting output is main-process orchestration; reading the emitted files back into the manifest
 * is `readFigmaStandIns` in main/lite/lite-source.ts.
 */

/** Where the agent writes each stand-in — mirrors the `.vortspec/metadata/<norm>.json` convention. */
export const LIGHT_HTML_DIR = ".vortspec/light-html";

/** Filesystem-safe segment — the reader and writer MUST agree on this to join by component name. */
export function normSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** Project-relative path for a component/variant stand-in. */
export function standInPath(component: string, variant: string): string {
  return `${LIGHT_HTML_DIR}/${normSegment(component)}/${normSegment(variant)}.html`;
}

export interface StandInTarget {
  name: string;
  figmaNodeId?: string;
  componentKey?: string;
  variants: string[];
}

/**
 * Build the agent prompt that produces framework-free HTML stand-ins by reusing the Figma read. The
 * prompt pins: the node-resolution recipe, the `get_design_context` read, framework-free + token-
 * referenced output, and the exact output path — so the result drops straight into the palette.
 */
export function buildLightStandInPrompt(targets: StandInTarget[]): string {
  const list = targets
    .map((t) => {
      const ref = t.figmaNodeId ? `figmaNodeId=${t.figmaNodeId}` : t.componentKey ? `componentKey=${t.componentKey}` : "no Figma ref — SKIP";
      return `- ${t.name} (${ref}) · variants: ${t.variants.length ? t.variants.join(", ") : "default"}`;
    })
    .join("\n");
  return [
    "Generate framework-free light HTML stand-ins for the design-system components below, by REUSING",
    "the existing Figma-read recipe (the same one generate-artifacts and visual-verify use). Do NOT",
    "build a new reader and do NOT author framework code in this pass.",
    "",
    "SEQUENCE (important): read each Figma node EXACTLY ONCE. From that single read, the light HTML is",
    "the FIRST output — produce it immediately so the live preview is available right away. The framework",
    "components are generated LATER, sequentially, reusing this same read; this pass emits ONLY the light",
    "HTML.",
    "",
    "For EACH component and EACH variant:",
    "1. RESOLVE the Figma node from its ref (figmaNodeId first; else componentKey scoped to the file's",
    "   library; else the Desktop Bridge) — the same resolution documented in generate-artifacts.",
    "2. READ it ONCE with the Figma MCP `get_design_context` (add `get_screenshot` if you need the pixel",
    "   reference). This returns the layer tree + styles already resolved as `var(--token, value)`. Do",
    "   not re-read the same node.",
    "3. EMIT a self-contained, FRAMEWORK-FREE HTML/CSS stand-in of that node FIRST: semantic HTML + inline",
    "   styles (or a scoped <style>). Use the RESOLVED token values from the read so it renders with no",
    "   framework and no token runtime. Make it FLUID: the root must be `max-width:100%` with NO fixed",
    "   pixel width wider than a small preview cell (~240px) — it is shown in a bento thumbnail, so avoid",
    "   hardcoded widths that would force a wide card. It MUST NOT contain: any `import`, JSX, `.variants.ts`,",
    "   `@/…` module path, `cva(`/`cn(`, `.tsx`/`.jsx`, or a `localhost:6006` Storybook URL. Plain HTML only.",
    `4. WRITE it to \`${LIGHT_HTML_DIR}/<component>/<variant>.html\` (create dirs). One file per variant.`,
    "",
    "Components:",
    list,
    "",
    "Keep each stand-in a faithful visual of the Figma node — this is the design source of truth, so the",
    "stand-in is faithful immediately, with no framework build needed. End with the list of files written.",
  ].join("\n");
}
