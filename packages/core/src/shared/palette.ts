/**
 * The lightweight "design system" palette (OpenSpec change: light-design-system, group 2). VortSpec's
 * fast, browsable component shelf + visual reference — the Playground's authoring surface, usable
 * before any framework component exists. It is a pure RENDERING of the lite manifest (`designer.md`):
 * the manifest already carries dual-keyed tokens and a framework-free stand-in per component/variant,
 * so building the palette is a deterministic projection — no Figma call, no framework runtime.
 *
 * `buildPalette` produces the browsable view-model (foundation panels + component shelf); the UI reads
 * it directly. `renderPaletteHtml` emits a SELF-CONTAINED HTML document (inline styles from resolved
 * token values, no `<script>`, no external assets) so the shelf renders standalone.
 *
 * Pure + framework-free (mirrors lite-manifest.ts). NOT an SDD-DE toolkit skill and NOT a Storybook
 * substitute — real Storybook is still built for the framework components; this is a VortSpec surface.
 */
import type { LiteManifest, LiteToken, TokenGroup, StandIn } from "./lite-manifest";
import { findFrameworkPointers, TOKEN_GROUPS } from "./lite-manifest";

export interface PaletteComponent {
  name: string;
  tier: string;
  variants: string[];
  readiness: "light-only" | "framework-ready";
  /** Placeholder stand-ins are visibly marked until harvest replaces them with the real render. */
  isPlaceholder: boolean;
  standIns: StandIn[];
}

export interface Palette {
  name: string;
  /** The visual-reference section: each used token group + the spacing-derived margin/padding scales. */
  foundations: {
    tokens: { group: TokenGroup; entries: LiteToken[] }[];
    spacing: LiteToken[];
    margins: LiteToken[];
    padding: LiteToken[];
  };
  components: PaletteComponent[];
}

/** Assemble the browsable palette view-model from the lite manifest. Pure. */
export function buildPalette(m: LiteManifest): Palette {
  const tokens = TOKEN_GROUPS.filter((g) => m.tokens[g].length > 0).map((group) => ({ group, entries: m.tokens[group] }));
  const components: PaletteComponent[] = m.components.map((c) => ({
    name: c.name,
    tier: c.tier,
    variants: c.variants,
    readiness: c.readiness,
    isPlaceholder: c.standIns.some((s) => s.source === "placeholder"),
    standIns: c.standIns,
  }));
  return {
    name: m.name,
    foundations: {
      tokens,
      spacing: m.foundations.spacing,
      margins: m.foundations.margins,
      padding: m.foundations.padding,
    },
    components,
  };
}

/** HTML-escape text injected into the document (names/values); stand-in HTML is injected as-is. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Render one foundation token group as swatches whose visual reflects the resolved value. */
function renderTokenGroup(group: TokenGroup, entries: LiteToken[]): string {
  const swatch = (t: LiteToken): string => {
    const v = esc(t.value);
    let demo: string;
    switch (group) {
      case "colors":
        demo = `<span class="lp-chip" style="background:${v}"></span>`;
        break;
      case "typography":
        demo = `<span class="lp-type" style="font-size:${v}">Ag</span>`;
        break;
      case "spacing":
        demo = `<span class="lp-bar" style="width:${v}"></span>`;
        break;
      case "shadows":
        demo = `<span class="lp-shadow" style="box-shadow:${v}"></span>`;
        break;
      case "radius":
        demo = `<span class="lp-radius" style="border-radius:${v}"></span>`;
        break;
    }
    return `<div class="lp-token">${demo}<code class="lp-name">${esc(t.name)}</code><code class="lp-val">${v}</code></div>`;
  };
  return `<section class="lp-group"><h3>${esc(group)}</h3><div class="lp-tokens">${entries.map(swatch).join("")}</div></section>`;
}

/** Render one scale (spacing / margins / padding) as labelled bars. */
function renderScale(label: string, entries: LiteToken[]): string {
  if (entries.length === 0) return "";
  const bars = entries
    .map((t) => `<div class="lp-token"><span class="lp-bar" style="width:${esc(t.value)}"></span><code class="lp-name">${esc(t.name)}</code><code class="lp-val">${esc(t.value)}</code></div>`)
    .join("");
  return `<section class="lp-group"><h3>${esc(label)}</h3><div class="lp-tokens">${bars}</div></section>`;
}

function renderComponent(c: PaletteComponent): string {
  const badge = c.readiness === "framework-ready"
    ? `<span class="lp-badge lp-ready">framework-ready</span>`
    : `<span class="lp-badge lp-light">light-only</span>`;
  const placeholder = c.isPlaceholder ? `<span class="lp-badge lp-placeholder">placeholder</span>` : "";
  const variants = c.standIns
    .map((s) => `<figure class="lp-variant"><div class="lp-render">${s.html}</div><figcaption>${esc(s.variant)}</figcaption></figure>`)
    .join("");
  return `<article class="lp-component" data-component="${esc(c.name)}"><header><h3>${esc(c.name)}</h3><span class="lp-tier">${esc(c.tier)}</span>${badge}${placeholder}</header><div class="lp-variants">${variants}</div></article>`;
}

const PALETTE_CSS = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 system-ui,sans-serif}
.lp{padding:24px;display:flex;flex-direction:column;gap:32px}
.lp h1{font-size:20px;margin:0}
.lp h2{font-size:16px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.04em;opacity:.7}
.lp h3{font-size:13px;margin:0 0 8px;opacity:.8}
.lp-groups,.lp-shelf{display:grid;gap:16px}
.lp-groups{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.lp-shelf{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.lp-tokens{display:flex;flex-direction:column;gap:6px}
.lp-token{display:flex;align-items:center;gap:8px}
.lp-name{font-size:11px;opacity:.9}
.lp-val{font-size:11px;opacity:.5;margin-left:auto}
.lp-chip{width:20px;height:20px;border-radius:4px;border:1px solid rgba(128,128,128,.3)}
.lp-type{display:inline-block;min-width:28px;line-height:1}
.lp-bar{display:inline-block;height:10px;background:currentColor;border-radius:2px;opacity:.6}
.lp-shadow{display:inline-block;width:20px;height:20px;border-radius:4px;background:#fff}
.lp-radius{display:inline-block;width:20px;height:20px;background:currentColor;opacity:.4}
.lp-component,.lp-group{border:1px solid rgba(128,128,128,.25);border-radius:8px;padding:12px}
.lp-component header{display:flex;align-items:center;gap:6px;margin-bottom:10px}
.lp-tier{font-size:10px;text-transform:uppercase;opacity:.5;letter-spacing:.05em}
.lp-badge{font-size:10px;padding:1px 6px;border-radius:99px;margin-left:auto}
.lp-light{background:#fde68a;color:#78350f}
.lp-ready{background:#bbf7d0;color:#14532d}
.lp-placeholder{background:#e5e7eb;color:#374151;margin-left:4px}
.lp-variants{display:flex;flex-wrap:wrap;gap:12px}
.lp-variant{margin:0;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.lp-variant figcaption{font-size:10px;opacity:.5}
.lp-render{display:flex;align-items:center;justify-content:center;min-height:40px}
`;

/**
 * Render the palette as a SELF-CONTAINED HTML document (no `<script>`, no external assets). Throws if
 * any framework pointer would leak from a stand-in — the shelf must stay framework-free. Optionally
 * bounded to a subset of components (e.g. one component's isolated preview).
 */
export function renderPaletteHtml(p: Palette): string {
  const foundations = [
    ...p.foundations.tokens.map((t) => renderTokenGroup(t.group, t.entries)),
    renderScale("margins", p.foundations.margins),
    renderScale("padding", p.foundations.padding),
  ].join("");
  const shelf = p.components.map(renderComponent).join("");
  const body = `<div class="lp"><h1>${esc(p.name)}</h1><section><h2>Foundations</h2><div class="lp-groups">${foundations}</div></section><section><h2>Components</h2><div class="lp-shelf">${shelf}</div></section></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PALETTE_CSS}</style></head><body>${body}</body></html>`;

  const leaks = findFrameworkPointers(shelf);
  if (leaks.length > 0) throw new Error(`palette would leak framework pointers from a stand-in (${leaks.join(", ")})`);
  return html;
}

/**
 * A self-contained palette makes no framework-runtime or network requests: no `<script>`, and no
 * external `src`/`href` (data: URIs are allowed). Returns violations (empty ⇒ self-contained).
 */
export function paletteSelfContainmentIssues(html: string): string[] {
  const issues: string[] = [];
  if (/<script[\s>]/i.test(html)) issues.push("contains a <script> tag");
  const ext = html.match(/\b(?:src|href)\s*=\s*"(?!data:|#)[^"]+"/gi);
  if (ext) issues.push(`loads external asset(s): ${ext.length}`);
  return issues;
}
