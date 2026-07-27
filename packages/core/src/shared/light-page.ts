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
import type { CompileResult } from "./compile";

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
    `COMPOSE A LIGHT PAGE named "${name}". This task OVERRIDES the project's normal framework-first workflow.`,
    "",
    "You are composing a static, FRAMEWORK-FREE light preview page from the design system that ALREADY",
    "EXISTS. For THIS task, IGNORE the SDD-DE / CLAUDE.md framework-first rules — none of them apply:",
    "  • Do NOT run Component Gap Detection, and do NOT report any 'components not built' gap.",
    "  • Do NOT scaffold or check for an app (no package.json, Vite, index.html, App.tsx, node_modules).",
    "  • Do NOT implement React/framework components, and do NOT run the 7-step cycle.",
    "  • Do NOT add, modify, or invent design tokens or brand colors — use only what already exists.",
    "A light page needs NONE of that: it reuses the light component stand-ins that already exist on disk.",
    "The real framework code is generated LATER by a SEPARATE transform step — not now.",
    "",
    "Description of the page:",
    description.trim() || "(no description given — infer a sensible layout for this page name)",
    "",
    "Steps:",
    "1. READ `designer.md` at the project root, and the stand-ins in `.vortspec/light-html/` — together they",
    "   ARE the component library: dual-keyed tokens (name + resolved value) + a framework-free HTML stand-in",
    "   per component. Compose ONLY from these; do not invent off-system components.",
    "2. COMPOSE the page by arranging those light components per the description. Respect the hierarchy:",
    "   a main container → sections → rows/columns → content. Style with the tokens' RESOLVED values so it",
    "   renders standalone (no framework, no token runtime).",
    "3. Output FRAMEWORK-FREE HTML/CSS only: semantic HTML + inline styles (or a scoped <style>). It MUST",
    "   NOT contain: `import`, JSX, `.variants.ts`, `@/…` module paths, `cva(`/`cn(`, `.tsx`/`.jsx`, or a",
    "   `localhost:6006` Storybook URL.",
    "4. Mark EACH reused design-system component with `data-component=\"<ComponentName>\"` on its root",
    "   element, using the exact component names from `designer.md` — the transform step maps these later.",
    `5. WRITE the page to \`${lightPagePath(name)}\` (create the dir). This file is your ONLY output.`,
    "",
    "End with the file written. Do not create, scaffold, or modify anything else.",
  ].join("\n");
}

/**
 * The deterministic-compile block of the convert prompt (light-design-system, group 6). When the light
 * page compiled cleanly, its JSX is the AUTHORITATIVE structure — token references already restored and
 * design-system components already mapped by lookup — so the agent places it instead of re-deriving layout
 * or re-picking tokens (that's where AI drifts). Only `residual`/`lintIssues` items need the agent's
 * judgment. Absent (or empty) compile → no block, and the agent builds from the light HTML as before.
 */
function convertCompileSection(compiled?: CompileResult): string[] {
  if (!compiled || !compiled.code.trim()) return [];
  const cov = compiled.deterministicCoverage;
  const needsJudgment = [...compiled.lintIssues, ...cov.residual];
  return [
    "DETERMINISTIC COMPILE (authoritative — use this as the page's exact structure):",
    "The light page has been compiled to framework JSX by pure lookup — token references are already",
    "restored (`var(--…)`) and every `data-component` is already mapped to its real component. Do NOT",
    "re-derive the layout, re-pick tokens, or rename components; reproduce this JSX and spend your effort",
    "only on imports, building any missing component, and routing.",
    "",
    "```tsx",
    compiled.code,
    "```",
    "",
    compiled.usedComponents.length > 0 ? `Components used (ensure each exists, then import): ${compiled.usedComponents.join(", ")}.` : "No design-system components were used (all plain elements).",
    `Deterministic coverage: ${cov.tokensRestored} token value(s) restored, ${cov.componentsMapped} component(s) mapped, ${cov.literalsKept} literal(s) kept.`,
    needsJudgment.length > 0
      ? `NEEDS YOUR JUDGMENT (the only non-deterministic parts): ${needsJudgment.join("; ")}.`
      : "Nothing was left unresolved — the compile is fully deterministic; keep it faithful.",
    "",
  ];
}

/**
 * Build the "convert to code" prompt (light-design-system, task 6). Triggered when the user is happy
 * with the LIGHT page — now do the real framework build in the background, using the light page as the
 * spec. THIS is where the framework-first work (scaffold + components + page) legitimately happens.
 */
export function buildConvertToFrameworkPrompt(name: string, compiled?: CompileResult): string {
  return [
    `CONVERT the light page "${name}" into real framework code. The user is happy with the light preview —`,
    "now build the real thing, using the light page as the authoritative spec.",
    "",
    `The light page is at \`${lightPagePath(name)}\`: a framework-free composition where each design-system`,
    "component instance is marked `data-component=\"<Name>\"`. This is the SPEC — match its layout, content,",
    "and component usage exactly.",
    "",
    ...convertCompileSection(compiled),
    "Read `.sdd-de/project.yaml` for the target framework/language/styling and follow the project's standards.",
    "Then do the full build FOR THIS PAGE (this is the framework-first work, now that it's wanted):",
    "1. If the app isn't scaffolded yet, scaffold it for the configured framework (package.json, entry,",
    "   index/App, Tailwind wired to the token file) — minimal but runnable.",
    "2. For EACH `data-component` island, ensure the real framework component exists — build any missing one",
    "   from the design system (its Figma reference + the tokens), following the project's component",
    "   standards (e.g. CVA + `cn()` + token-referenced classes). REUSE components that already exist.",
    "3. Compose the page as a real framework page/route that uses those components and reproduces the light",
    "   page's layout + content. EVERY color/spacing/radius/type value MUST reference a design token.",
    "4. Wire the page into the app's routing so it's reachable (and, for a router-less app, the",
    "   screen-preview harness) — so it appears as a normal navigable route.",
    "",
    "The light page stays as-is (it remains the editable source of truth). End with the framework page +",
    "any new components created and the route wired, so the Playground can navigate to the real page.",
  ].join("\n");
}
