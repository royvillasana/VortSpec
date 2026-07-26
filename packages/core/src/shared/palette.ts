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
    return `<div class="lp-token">${demo}<code class="lp-name" title="${esc(t.name)}">${esc(t.name)}</code><code class="lp-val" title="${v}">${v}</code></div>`;
  };
  // Bento emphasis: the most visual groups get a wider cell.
  const span = group === "colors" || group === "typography" ? " lp-span2" : "";
  return `<section class="lp-card${span}"><h3>${esc(group)}</h3><div class="lp-tokens">${entries.map(swatch).join("")}</div></section>`;
}

/** Render one scale (spacing / margins / padding) as labelled bars. */
function renderScale(label: string, entries: LiteToken[]): string {
  if (entries.length === 0) return "";
  const bars = entries
    .map((t) => {
      const v = esc(t.value);
      return `<div class="lp-token"><span class="lp-bar" style="width:${v}"></span><code class="lp-name" title="${esc(t.name)}">${esc(t.name)}</code><code class="lp-val" title="${v}">${v}</code></div>`;
    })
    .join("");
  return `<section class="lp-card"><h3>${esc(label)}</h3><div class="lp-tokens">${bars}</div></section>`;
}

function renderComponent(c: PaletteComponent): string {
  const badge = c.readiness === "framework-ready"
    ? `<span class="lp-badge lp-ready">framework-ready</span>`
    : `<span class="lp-badge lp-light">light-only</span>`;
  const placeholder = c.isPlaceholder ? `<span class="lp-badge lp-placeholder">placeholder</span>` : "";
  const variants = c.standIns
    .map((s) => {
      // A placeholder stand-in has no real render yet — show a visible labelled stub, not an empty div,
      // so the shelf never reads as a black void before harvest replaces it with the real render.
      const body =
        s.source === "placeholder"
          ? `<div class="lp-ph">awaiting framework render</div>`
          : s.html;
      return `<figure class="lp-variant"><div class="lp-render">${body}</div><figcaption>${esc(s.variant)}</figcaption></figure>`;
    })
    .join("");
  const span = c.tier === "organism" || c.tier === "template" ? " lp-span2" : "";
  return `<article class="lp-card lp-component${span}" data-component="${esc(c.name)}"><header><h3 title="${esc(c.name)}">${esc(c.name)}</h3><span class="lp-tier">${esc(c.tier)}</span>${badge}${placeholder}</header><div class="lp-variants">${variants}</div></article>`;
}

const PALETTE_CSS = `
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1a1a1e;--muted:#6b7280;--card:#f6f6f8;--border:rgba(0,0,0,.12)}
@media (prefers-color-scheme:dark){:root{--bg:#161619;--fg:#e8e8ec;--muted:#9aa0aa;--card:#202024;--border:rgba(255,255,255,.14)}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg)}
.lp{padding:24px;display:flex;flex-direction:column;gap:28px;max-width:1440px}
.lp h1{font-size:20px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp h2{font-size:12px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.lp h3{font-size:13px;margin:0 0 12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* bento grid: uniform columns (every column filled → no horizontal gaps); a masonry script sets each
   card's row-span from its measured height (→ no vertical gaps). One merged wall, cells touch. */
.lp-bento{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));grid-auto-rows:8px;grid-auto-flow:row dense;gap:0}
.lp-card{background:var(--card);border:1px solid var(--border);padding:16px;min-width:0;overflow:hidden}
.lp-tokens{display:flex;flex-direction:column;gap:9px}
.lp-token{display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden}
.lp-name{font-size:11px;font-family:ui-monospace,monospace;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-val{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;flex:0 0 auto;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.lp-chip{width:22px;height:22px;border-radius:6px;border:1px solid var(--border);flex:none}
.lp-type{display:inline-block;min-width:30px;line-height:1;flex:none}
.lp-bar{display:inline-block;height:12px;width:auto;max-width:96px;background:var(--fg);border-radius:2px;opacity:.55;flex:0 0 auto}
.lp-shadow{display:inline-block;width:22px;height:22px;border-radius:6px;background:var(--card);border:1px solid var(--border);flex:none}
.lp-radius{display:inline-block;width:22px;height:22px;background:var(--fg);opacity:.35;flex:none}
.lp-component header{display:flex;align-items:center;gap:6px;margin-bottom:12px;min-width:0}
.lp-component h3{margin:0;flex:0 1 auto}
.lp-tier{font-size:10px;text-transform:uppercase;color:var(--muted);letter-spacing:.05em;flex:none}
.lp-badge{font-size:10px;padding:1px 7px;border-radius:99px;margin-left:auto;flex:none;white-space:nowrap}
.lp-light{background:#fde68a;color:#78350f}
.lp-ready{background:#bbf7d0;color:#14532d}
.lp-placeholder{background:#e5e7eb;color:#374151;margin-left:4px}
.lp-variants{display:flex;flex-wrap:wrap;gap:12px}
.lp-variant{margin:0;display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0;max-width:100%}
.lp-variant figcaption{font-size:10px;color:var(--muted);font-family:ui-monospace,monospace;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-render{display:flex;align-items:center;justify-content:center;min-height:48px;min-width:96px;max-width:100%;overflow:hidden}
.lp-ph{display:flex;align-items:center;justify-content:center;min-height:48px;min-width:120px;padding:8px 12px;border:1px dashed var(--border);border-radius:8px;color:var(--muted);font-size:11px;text-align:center}
`;

/**
 * A tiny inline masonry layout script (no external deps): it measures each card and sets its grid
 * row-span so cards pack with NO vertical gaps regardless of content height — the only reliable way to
 * do masonry in Chromium (native `masonry` isn't supported). Runs on load + resize. It's our own
 * trusted code and loads nothing, so it keeps the page self-contained.
 */
const MASONRY_SCRIPT = `<script>
(function(){
  function layout(){
    var cards=document.querySelectorAll('.lp-bento .lp-card'),i;
    for(i=0;i<cards.length;i++){cards[i].style.gridRowEnd='';}
    for(i=0;i<cards.length;i++){cards[i].style.gridRowEnd='span '+Math.max(1,Math.ceil(cards[i].getBoundingClientRect().height/8));}
  }
  function schedule(){window.requestAnimationFrame(layout);}
  if(document.readyState!=='loading')schedule();else document.addEventListener('DOMContentLoaded',schedule);
  window.addEventListener('load',schedule);
  window.addEventListener('resize',schedule);
})();
</script>`;

/**
 * Render the palette as a self-contained HTML document (inline styles + the inline masonry script, no
 * external assets). One merged bento wall — no Foundations/Components split (each card is self-labelled).
 * Throws if any framework pointer would leak from a stand-in — the shelf must stay framework-free.
 */
export function renderPaletteHtml(p: Palette): string {
  const shelf = p.components.map(renderComponent);
  const cards = [
    ...p.foundations.tokens.map((t) => renderTokenGroup(t.group, t.entries)),
    renderScale("margins", p.foundations.margins),
    renderScale("padding", p.foundations.padding),
    ...shelf,
  ]
    .filter(Boolean)
    .join("");
  const body = `<div class="lp"><h1>${esc(p.name)}</h1><div class="lp-bento">${cards}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PALETTE_CSS}</style></head><body>${body}${MASONRY_SCRIPT}</body></html>`;

  const leaks = findFrameworkPointers(shelf.join(""));
  if (leaks.length > 0) throw new Error(`palette would leak framework pointers from a stand-in (${leaks.join(", ")})`);
  return html;
}

/**
 * A self-contained palette makes no NETWORK requests: no EXTERNAL script and no external `src`/`href`
 * (data: URIs and in-page anchors are allowed). The inline masonry script is fine — it loads nothing.
 * Returns violations (empty ⇒ self-contained).
 */
export function paletteSelfContainmentIssues(html: string): string[] {
  const issues: string[] = [];
  if (/<script[^>]*\bsrc\s*=/i.test(html)) issues.push("loads an external script");
  const ext = html.match(/\b(?:src|href)\s*=\s*"(?!data:|#)[^"]+"/gi);
  if (ext) issues.push(`loads external asset(s): ${ext.length}`);
  return issues;
}
