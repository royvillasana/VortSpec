import {
  GOOGLE_FONTS_BUNDLED,
  isFontFamilyValue,
  leadFamily,
  type FontFamily,
  type FontSources,
} from "@vortspec/core/fonts";
import { getInspectorTokens } from "./token-parser";
import { readFigmaVariableModel, normName } from "./figma-reconcile";

/**
 * Enumerate the font families the design-system editor can offer (change: design-system-style-panel,
 * Phase 3). Three of the four sources are readable in main; SYSTEM fonts are not — they come from
 * Chromium's `queryLocalFonts()` in the renderer and are merged there.
 *
 * Every source degrades independently: a project with no Figma file, or a machine with no network, still
 * gets a working picker from whatever remains.
 */

/** Families the project's own typography tokens already name. */
async function projectFamilies(projectPath: string): Promise<FontFamily[]> {
  const result = await getInspectorTokens(projectPath).catch(() => null);
  const out = new Map<string, FontFamily>();
  for (const t of result?.tokens ?? []) {
    if (t.type !== "typography") continue;
    if (!/font.*family|family|typeface/i.test(t.name)) continue;
    if (!isFontFamilyValue(t.resolvedValue)) continue;
    const family = leadFamily(t.resolvedValue);
    if (family && !out.has(family.toLowerCase())) {
      out.set(family.toLowerCase(), { family, source: "project", detail: `--${t.name}` });
    }
  }
  return [...out.values()];
}

/**
 * Families the connected Figma file uses, read from the variables export — a STRING variable whose name
 * says "font family" carries exactly that. Marked as Figma's, because matching the design is precisely
 * why one of these is worth picking over any other.
 */
async function figmaFamilies(projectPath: string): Promise<FontFamily[]> {
  const model = await readFigmaVariableModel(projectPath).catch(() => null);
  const out = new Map<string, FontFamily>();
  for (const v of model?.variables ?? []) {
    const n = normName(v.name);
    if (!/font-family|fontfamily|typeface/.test(n)) continue;
    const value = (v.resolvedValue ?? "").trim();
    if (!isFontFamilyValue(value)) continue;
    const family = leadFamily(value);
    if (family && !out.has(family.toLowerCase())) {
      out.set(family.toLowerCase(), { family, source: "figma", detail: v.name });
    }
  }
  return [...out.values()];
}

/**
 * The Google catalog. `full: false` returns the bundled head (instant, offline); `full: true` fetches the
 * complete family list once and falls back to the bundled set when the network is unavailable — a picker
 * that fails to open would be worse than one that offers fewer families.
 */
let cachedFullCatalog: string[] | null = null;

export async function googleFamilies(full: boolean): Promise<{ families: string[]; complete: boolean }> {
  if (!full) return { families: GOOGLE_FONTS_BUNDLED, complete: false };
  if (cachedFullCatalog) return { families: cachedFullCatalog, complete: true };
  try {
    const res = await fetch("https://fonts.googleapis.com/metadata/fonts");
    // Google prefixes this response with an anti-JSON-hijacking guard line.
    const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
    const parsed = JSON.parse(text) as { familyMetadataList?: Array<{ family?: string }> };
    const families = (parsed.familyMetadataList ?? []).map((f) => f.family).filter((f): f is string => !!f);
    if (families.length === 0) throw new Error("empty catalog");
    cachedFullCatalog = families;
    return { families, complete: true };
  } catch {
    return { families: GOOGLE_FONTS_BUNDLED, complete: false };
  }
}

/**
 * Every family this project can offer from main: its own tokens, its Figma file, and Google. The renderer
 * merges in system fonts, which only it can enumerate.
 */
export async function getFontSources(projectPath: string, full = false): Promise<FontSources> {
  const [project, figma, google] = await Promise.all([
    projectFamilies(projectPath),
    figmaFamilies(projectPath),
    googleFamilies(full),
  ]);
  const seen = new Set<string>();
  const families: FontFamily[] = [];
  // Project first, then Figma, then Google — most specific to this project's design wins the dedupe, so a
  // family already in the design system isn't re-labelled as a generic Google suggestion.
  for (const f of [...project, ...figma]) {
    const k = f.family.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      families.push(f);
    }
  }
  for (const family of google.families) {
    const k = family.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      families.push({ family, source: "google" });
    }
  }
  return { families, googleComplete: google.complete };
}
