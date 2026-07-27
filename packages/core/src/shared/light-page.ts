/**
 * Light page authoring (OpenSpec change: light-design-system, task 5.1). Compose a PAGE from the light
 * design system — the component stand-ins + dual-keyed tokens in `designer.md` — with NO built React
 * required. The page is framework-free HTML, rendered as a live light preview; the framework code is
 * generated LATER by the transform step (compile.ts), reusing the same components. This is the whole
 * point of the feature: create the page against the live design system, transform to the framework after.
 *
 * Pure: builds the agent prompt + the on-disk contract. The agent (via the user's tools) composes and
 * writes the page; VortSpec never authors framework code here.
 */
import { normSegment } from "./light-standin";

/** Where composed light pages live. */
export const LIGHT_PAGES_DIR = ".vortspec/light-pages";

/** Project-relative path for a composed light page. */
export function lightPagePath(name: string): string {
  return `${LIGHT_PAGES_DIR}/${normSegment(name)}.html`;
}

/**
 * Build the prompt that composes a light page from the design system. It pins: read `designer.md` (the
 * light component library + tokens), reuse ONLY those components, stay framework-free, mark each reused
 * component with `data-component` (so the transform can map it to the real component), and write the page.
 */
export function buildLightPagePrompt(name: string, description: string): string {
  return [
    `Compose a LIGHT page named "${name}" from the project's live design system. Description of the page:`,
    "",
    description.trim() || "(no description given — infer a sensible layout for this page name)",
    "",
    "Rules — this is a LIGHT preview composed from the design system; the real framework code is generated",
    "LATER by a separate transform step, so do NOT author any framework/React code here.",
    "",
    "1. READ `designer.md` at the project root FIRST. It is the light design system: dual-keyed tokens",
    "   (name + resolved value) and a framework-free HTML stand-in for every component — the component",
    "   library you MUST compose from. Do not invent off-system components; reuse the stand-ins' markup.",
    "2. COMPOSE the page by arranging those light components per the description. Respect the hierarchy:",
    "   a main container → sections → rows/columns → content. Style with the tokens' RESOLVED values so it",
    "   renders standalone (no framework, no token runtime).",
    "3. Output FRAMEWORK-FREE HTML/CSS only: semantic HTML + inline styles (or a scoped <style>). It MUST",
    "   NOT contain: `import`, JSX, `.variants.ts`, `@/…` module paths, `cva(`/`cn(`, `.tsx`/`.jsx`, or a",
    "   `localhost:6006` Storybook URL.",
    "4. Mark EACH reused design-system component with `data-component=\"<ComponentName>\"` on its root",
    "   element, using the exact component names from `designer.md` — the transform step maps these to the",
    "   real framework components.",
    `5. WRITE the page to \`${lightPagePath(name)}\` (create the dir).`,
    "",
    "End with the file written. The page must look like a real, on-brand page — but built entirely from the",
    "light design system, ready to transform to the user's framework afterward.",
  ].join("\n");
}
