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
    "   a main container → sections → rows/columns → content.",
    "   TOKENS — style every design-system property as `var(--<token-name>, <resolved value>)`, e.g.",
    "   `background: var(--color-accent, #5433eb)`. BOTH halves matter: the reference is what binds the page",
    "   to the design system, and the fallback is what keeps it rendering standalone with no token runtime.",
    "   Styling with the resolved value ALONE severs the page from the design system the moment it is",
    "   created — it still renders, so nothing looks wrong, but a token edit can never reach it and nothing",
    "   can say what the component is made of. The stand-ins already do exactly this; follow them.",
    "   Do NOT declare your own name for a value `designer.md` already names — no `--radius-pill` when it",
    "   lists a full/pill radius, no `--space-2` when it lists a spacing scale. Read the names off",
    "   `designer.md` and use them. If the page genuinely needs a value the design system does not name,",
    "   you may declare a local one — it will be reported as not part of the design system.",
    "3. Output FRAMEWORK-FREE HTML/CSS/JS only: semantic HTML + inline styles (or a scoped <style>). It MUST",
    "   NOT contain: `import`, JSX, `.variants.ts`, `@/…` module paths, `cva(`/`cn(`, `.tsx`/`.jsx`, or a",
    "   `localhost:6006` Storybook URL. No framework, no build step — plain HTML/CSS and vanilla JS only.",
    "4. MEDIA & ASSETS — NEVER inline video or audio (or any large binary) as a base64 `data:` URI. A",
    "   base64 video bloats the page to hundreds of KB and FREEZES the live preview. Instead:",
    "   • Real media file provided: save it under `.vortspec/light-pages/assets/` and reference it by a",
    `     RELATIVE path, e.g. \`<video src="assets/hero.mp4" autoplay muted loop playsinline>\` — the light`,
    "     origin serves that folder (with range support), so the file streams instead of bloating the HTML.",
    "   • Video/hero requested but NO real file exists: do NOT fabricate or encode one, and do NOT inline",
    "     base64. Use a lightweight placeholder — a poster image (`<img>` / CSS `background-image`) or a CSS",
    "     gradient — and point the media element at an `assets/…` path for the user to drop the real file in.",
    "   • Only TINY inline `data:` URIs are acceptable (small SVG icons, under ~2KB). Never inline anything",
    "     larger; images too big to be tiny go in `assets/` and are referenced by path.",
    "5. Mark EACH reused design-system component with `data-component=\"<ComponentName>\"` on its root",
    "   element, using the exact component names from `designer.md` — the transform step maps these later.",
    "6. INTERACTIVITY (Astro-style islands): ONLY where a screen genuinely needs client behavior (tabs,",
    "   accordion, toggle/menu open-close, carousel, dropdown), add a SELF-CONTAINED, framework-free",
    "   `<script>` ISLAND scoped to that `data-component` instance — vanilla JS that wires the behavior on",
    "   load (query the island, add listeners). Keep the rest of the page static HTML/CSS; add an island",
    "   only where interactivity is actually required, and keep each island small and bounded to its",
    "   component. Mark the interactive root with `data-island` so the transform maps it to an interactive",
    "   component. NO frameworks, NO imports, NO external scripts.",
    "   ANIMATED / SHADER BACKGROUND: for a decorative animated or shader background, use a bounded WebGL",
    "   (or 2D canvas) vanilla-JS island — a `<canvas>` + a small self-contained `<script data-island>` that",
    "   owns only that background, no library. Keep it performant: cap `devicePixelRatio` to ~1.5, pause the",
    "   render loop when offscreen (IntersectionObserver) and on `prefers-reduced-motion: reduce` (draw one",
    "   static frame), and keep the shader compact.",
    `7. WRITE the page to \`${lightPagePath(name)}\` (create the dir). This is your primary output; any`,
    "   referenced media saved under `.vortspec/light-pages/assets/` is the only other thing you write.",
    "",
    "End with the page written (plus any media under `.vortspec/light-pages/assets/`). Do not create,",
    "scaffold, or modify anything else.",
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

/**
 * Build the Flow's "Generate code" prompt (light-pages-on-canvas, group 5). The user has created + approved
 * their screens in the Playground; now convert ALL of them, in one run, to real code in the framework the
 * user selected during the initial flow — build/reuse the design-system components, then AUDIT and VALIDATE
 * (AI review + visual comparison against each screen). The screens stay as the editable source of truth.
 * Framework-agnostic: the target framework/language/styling come from `.sdd-de/project.yaml`, NOT hardcoded.
 */
export function buildGenerateCodePrompt(names: string[]): string {
  const list = names.map((n) => `  - \`${lightPagePath(n)}\`  (screen "${n}")`).join("\n");
  return [
    "GENERATE FRAMEWORK CODE for the screens the user built and approved in the Playground. Convert ALL of",
    "the screens below into real code in the framework the user selected during setup — this is the",
    "deliberate framework build, now that the user is ready.",
    "",
    "FIRST, read `.sdd-de/project.yaml` for the target framework/language/styling (React, Vue, Svelte,",
    "Angular, …) and the component/token paths. Produce code in THAT framework — do NOT default to React.",
    "",
    "Screens to convert (each file is framework-free HTML/CSS/JS and is the AUTHORITATIVE spec — match its",
    "layout, content, and every `data-component=\"<Name>\"` usage exactly):",
    list,
    "",
    "For the whole set:",
    "1. If the app isn't scaffolded for the configured framework yet, scaffold it minimally but runnable",
    "   (entry, root, styling wired to the token file).",
    "2. For EACH `data-component` island across the screens, ensure the real component exists in the",
    "   configured framework — build any missing one from the design system (its Figma reference + tokens),",
    "   following the project's component standards; REUSE components that already exist. (These may already",
    "   be built by the background component build — reuse them.)",
    "3. Compose each screen as a real framework page/route that uses those components and reproduces the",
    "   screen's layout + content. EVERY color/spacing/radius/type value MUST reference a design token.",
    "4. INTERACTIVITY: where a screen marks an interactive `data-island` (a self-contained vanilla-JS island,",
    "   e.g. tabs/accordion/toggle/carousel), reproduce that behavior in the framework's idiomatic way — an",
    "   interactive component with the equivalent state/handlers — NOT a copied <script>. Preserve the exact",
    "   behavior the island had.",
    "5. Wire each page into the app's routing (or the router-less screen-preview harness) so it's navigable.",
    "",
    "THEN VALIDATE — do not consider a screen done until it passes:",
    "6. AUDIT the generated code (token discipline: no hardcoded values; correct component reuse; a11y).",
    "7. VISUAL-VALIDATE each generated page against its screen file — render it and compare; fix any",
    "   discrepancy so the framework page matches the screen the user approved.",
    "",
    "The screens (`.vortspec/light-pages/*.html`) stay UNCHANGED — they remain the editable source of truth.",
    "End with: every screen converted to the selected framework, components built/reused, routes wired, and",
    "each page audited + visually validated against its screen.",
  ].join("\n");
}
