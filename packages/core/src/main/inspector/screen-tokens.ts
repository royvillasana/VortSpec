import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { LIGHT_PAGES_DIR } from "@vortspec/core/light-page";
import { parseCssContexts, DEFAULT_CONTEXT } from "./token-parser";

/**
 * Read the design tokens the user's SCREENS declare, and reconcile them back into the design system
 * (change: design-system-token-editor, section 6).
 *
 * A composed light page carries its own `:root` token block using the SAME token names as the design
 * system (`--color-accent`, `--radius-container`, …). When the page's brand differs from the consumed
 * library's defaults — an Astryx project whose screens are built around `#5433eb` while the library still
 * says `light-dark(#262626, #ebebeb)` — the screens have effectively chosen a different design system.
 * This surfaces that difference so the design system can FOLLOW the screens, which is the direction the
 * user actually works in: they pick a look on the page, and the system should match it.
 *
 * Deterministic and name-based — no color clustering or guessing. It only ever proposes; adopting is an
 * explicit user action that writes the same durable overlay every other lever edit writes.
 */

/** One token the screens declare, with the value that won and who dissented. */
export interface ScreenTokenUse {
  value: string;
  /** Screens declaring the winning value. */
  screens: string[];
  /** Screens declaring something else — the majority won, but say so rather than hide it. */
  conflicts?: Array<{ screen: string; value: string }>;
}

/** Cap so a project with a huge page set can't stall the scan. */
const MAX_SCREENS = 60;

/** Extract the CSS inside every `<style>` block — where a composed page declares its token root. */
function styleBlocks(html: string): string {
  const out: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push(m[1]);
  return out.join("\n");
}

/**
 * The tokens each screen declares at its DEFAULT context (`:root`). Per-screen values are collected,
 * then a token's value is decided by how many screens declare it — ties broken by the first screen in
 * name order, so the result is stable rather than filesystem-dependent.
 */
export async function readScreenTokens(
  projectPath: string,
): Promise<{ screens: string[]; tokens: Map<string, ScreenTokenUse> }> {
  let files: string[];
  try {
    files = (await readdir(join(projectPath, LIGHT_PAGES_DIR)))
      .filter((f) => f.toLowerCase().endsWith(".html"))
      .sort()
      .slice(0, MAX_SCREENS);
  } catch {
    return { screens: [], tokens: new Map() };
  }

  const screens: string[] = [];
  // token → value → the screens declaring it.
  const byToken = new Map<string, Map<string, string[]>>();
  for (const file of files) {
    const html = await readFile(join(projectPath, LIGHT_PAGES_DIR, file), "utf8").catch(() => null);
    if (html === null) continue;
    const screen = basename(file, ".html");
    screens.push(screen);
    const parse = parseCssContexts(styleBlocks(html));
    for (const [name, byCtx] of parse.raw) {
      // Only the page's ROOT declarations are its design system; a value redeclared inside one component's
      // rule is that component's local tweak, not the page's token choice.
      const value = byCtx.get(DEFAULT_CONTEXT);
      if (!value || value.startsWith("var(")) continue;
      let values = byToken.get(name);
      if (!values) byToken.set(name, (values = new Map()));
      values.set(value, [...(values.get(value) ?? []), screen]);
    }
  }

  const tokens = new Map<string, ScreenTokenUse>();
  for (const [name, values] of byToken) {
    const ranked = [...values.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const [winner, winnerScreens] = ranked[0];
    const conflicts = ranked
      .slice(1)
      .flatMap(([value, list]) => list.map((screen) => ({ screen, value })));
    tokens.set(name, { value: winner, screens: winnerScreens, ...(conflicts.length ? { conflicts } : {}) });
  }
  return { screens, tokens };
}
