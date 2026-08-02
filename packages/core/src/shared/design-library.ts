import { z } from "zod";
import { applyLightDark, controlFor, sameDesignValue, styleControlSchema, type StyleControl } from "@vortspec/core/style-values";
import type { InspectorToken, TokenType } from "@vortspec/core/inspector";

/**
 * The design system, grouped by STYLE PROPERTY (change: design-system-style-panel).
 *
 * The Library tab is sectioned by property — colors, typography, spacing, borders, shadows — and each
 * section's rows are the PROJECT'S OWN TOKENS of that type, under their own names.
 *
 * That last part is the whole point. The lever model this replaces enumerated what VortSpec knew: seven
 * semantic knobs, each hard-wired to one token per library. On a real Astryx project "Card radius" wrote
 * `--radius-container` while the screens rounded cards with `--radius-card`, so the knob moved five
 * elements and none of the cards — and `--radius-pill`, `--radius-element`, the whole spacing scale and
 * all typography had no knob at all. Deriving the rows from the project instead means a token is reachable
 * because the project HAS it, not because VortSpec has a name for it.
 *
 * The section grouping needs no new taxonomy: the token parser already types every token as
 * `color | typography | spacing | radius | shadow | other`, which IS the five sections. `other` is left to
 * the raw Tokens tab.
 */

/** The five sections, in display order. `other`-typed tokens belong to the Tokens tab, not here. */
export const styleSectionSchema = z.enum(["color", "typography", "spacing", "radius", "shadow"]);
export type StyleSection = z.infer<typeof styleSectionSchema>;

export const STYLE_SECTIONS: Array<{ section: StyleSection; label: string; hint: string }> = [
  { section: "color", label: "Colors", hint: "Every color your design system defines." },
  { section: "typography", label: "Typography", hint: "Font families, sizes, weights and line heights." },
  { section: "spacing", label: "Spacing", hint: "The spacing scale — margins, padding and gaps." },
  { section: "radius", label: "Borders", hint: "Corner radii and border widths." },
  { section: "shadow", label: "Shadows", hint: "Elevation and shadow values." },
];

/** A token, ready to render and edit. */
export const libraryRowSchema = z.object({
  /** Token name without the leading `--`. */
  token: z.string(),
  /** Live value (overlay-aware) — what the design system resolves to right now. */
  value: z.string(),
  /** As written; a `var(--other)` reference here means this token aliases another. */
  rawValue: z.string(),
  /** The control to render, refined from the live value so it matches what the token actually holds. */
  control: styleControlSchema,
  /** How many component sources reference this token — the blast radius of an edit, at a glance. */
  uses: z.number(),
  /**
   * Set when the token is declared not by the project's own token file but by a file it `@import`s —
   * typically a consumed library's theme inside `node_modules`. Edits still route to the durable overlay.
   */
  fromImport: z.string().optional(),
});
export type LibraryRow = z.infer<typeof libraryRowSchema>;

export const librarySectionSchema = z.object({
  section: styleSectionSchema,
  label: z.string(),
  hint: z.string(),
  rows: z.array(libraryRowSchema),
});
export type LibrarySection = z.infer<typeof librarySectionSchema>;

// ── Live preview ──────────────────────────────────────────────────────────────

/**
 * The values the Live Preview draws with, resolved BY ROLE against the project's real tokens.
 *
 * Resolving by role rather than "the first token in each section" is not a nicety. Section order follows
 * the token file, and on a real Astryx project that made the preview's accent `--border-width: 1px`, its
 * radius `--radius-none: 0` and its shadow `--color-shadow` — none of them the right kind of value, and
 * none of them touched by a preset, so the preview could neither look like the design system nor change
 * when one was applied.
 *
 * These are the SAME roles presets write, so applying a preset always moves the preview.
 */
export const designPreviewSchema = z.object({
  primary: z.string().optional(),
  background: z.string().optional(),
  surface: z.string().optional(),
  text: z.string().optional(),
  textMuted: z.string().optional(),
  border: z.string().optional(),
  radius: z.string().optional(),
  shadow: z.string().optional(),
  fontFamily: z.string().optional(),
  /** role → the token it resolved to, so the preview can say what it drew with. */
  tokens: z.record(z.string(), z.string()),
});
export type DesignPreview = z.infer<typeof designPreviewSchema>;

/** Candidates per preview role. The colour/radius/shadow/font ones mirror what presets write. */
const PREVIEW_ROLES: Record<string, string[]> = {
  primary: ["color-primary", "primary", "color-accent", "accent", "brand-primary", "color-brand"],
  background: ["color-background-body", "color-background", "background", "color-bg"],
  surface: ["color-background-surface", "color-background-card", "color-surface", "surface"],
  text: ["color-text-primary", "color-text", "text", "color-foreground", "foreground"],
  textMuted: ["color-text-secondary", "color-text-muted", "text-muted", "color-muted"],
  border: ["color-border", "border-color", "border"],
  radius: ["radius-container", "radius-card", "radius-base", "radius-md", "radius"],
  shadow: ["shadow-med", "shadow-base", "shadow-md", "shadow-default", "shadow"],
  fontFamily: ["font-family-body", "font-family-base", "font-family", "font-body", "font-sans"],
};

/** Which token types a role may legitimately bind to, so a role never picks a value of the wrong kind. */
const ROLE_TYPE: Record<string, TokenType> = {
  primary: "color",
  background: "color",
  surface: "color",
  text: "color",
  textMuted: "color",
  border: "color",
  radius: "radius",
  shadow: "shadow",
  fontFamily: "typography",
};

/**
 * Resolve the preview's roles against the project's tokens (pure). A role binds only to a token the
 * project genuinely has AND whose TYPE matches — that type check is what stops `--border-width` (a length
 * whose name contains "border") standing in for a border colour.
 */
export function resolvePreview(tokens: InspectorToken[]): DesignPreview {
  const byName = new Map(tokens.map((t) => [t.name.toLowerCase(), t]));
  const out: DesignPreview = { tokens: {} };
  for (const [role, candidates] of Object.entries(PREVIEW_ROLES)) {
    const want = ROLE_TYPE[role];
    const hit = candidates.map((c) => byName.get(c.toLowerCase())).find((t) => t && t.type === want);
    if (!hit) continue;
    (out as Record<string, unknown>)[role] = hit.resolvedValue;
    out.tokens[role] = hit.name;
  }
  return out;
}

export const designSystemLibrarySchema = z.object({
  designSource: z.string().nullable(),
  componentLibrary: z.string().nullable(),
  /** The project's apply strategy (`css-vars`, `theme-object:<lib>`, `overlay-injected`, …). */
  themeApply: z.string(),
  /** True when the overlay can't render as CSS and needs the "Customize theme" agent dispatch. */
  needsThemeAgent: z.boolean(),
  sections: z.array(librarySectionSchema),
  /** The values the Live Preview draws with, resolved by role (see {@link resolvePreview}). */
  preview: designPreviewSchema,
});
export type DesignSystemLibrary = z.infer<typeof designSystemLibrarySchema>;

/** The lever-control kind a section's values take when there is no live value to refine from. */
const SECTION_KIND: Record<StyleSection, "color" | "length" | "shadow"> = {
  color: "color",
  typography: "length", // font sizes dominate; a family/weight refines to text from its value
  spacing: "length",
  radius: "length",
  shadow: "shadow",
};

/**
 * Group a project's tokens into the five sections (pure). Order within a section follows the token file,
 * which is the author's own ordering — a scale reads as a scale rather than being alphabetised apart.
 */
export function buildLibrarySections(tokens: InspectorToken[]): LibrarySection[] {
  const byType = new Map<TokenType, InspectorToken[]>();
  for (const t of tokens) {
    const list = byType.get(t.type);
    if (list) list.push(t);
    else byType.set(t.type, [t]);
  }
  return STYLE_SECTIONS.map(({ section, label, hint }) => ({
    section,
    label,
    hint,
    rows: (byType.get(section) ?? []).map<LibraryRow>((t) => ({
      token: t.name,
      value: t.resolvedValue,
      rawValue: t.rawValue,
      control: controlOf(section, t.resolvedValue),
      uses: t.uses,
      ...(t.fromImport ? { fromImport: t.fromImport } : {}),
    })),
  }));
}

/** The control for a row: the live value decides, the section only supplies the fallback. */
export function controlOf(section: StyleSection, value: string): StyleControl {
  return controlFor(SECTION_KIND[section], value);
}

// ── Screens → design system ───────────────────────────────────────────────────

/**
 * One token whose value in the user's SCREENS differs from the design system's.
 *
 * A composed screen declares its own `:root` token block using the design system's token names, so a page
 * built around `--color-accent: #5433eb` while the library still says `light-dark(#262626, #ebebeb)` has
 * quietly chosen a different design system. This is that difference, offered on the token's own row so the
 * user can adopt it where they are already looking.
 */
export const tokenDriftSchema = z.object({
  token: z.string(),
  /** What the design system currently resolves to. */
  designValue: z.string(),
  /** What the screens declare. */
  screenValue: z.string(),
  /**
   * The value to WRITE when adopting — `screenValue`, except that a design value carrying a `light-dark()`
   * pair keeps its dark half, since a light page only ever states light mode.
   */
  adoptValue: z.string(),
  /** Screens declaring `screenValue`. */
  screens: z.array(z.string()),
  /** Screens declaring something else — the majority won; these are the dissenters. */
  conflicts: z.array(z.object({ screen: z.string(), value: z.string() })).optional(),
});
export type TokenDrift = z.infer<typeof tokenDriftSchema>;

export const screenTokenDriftSchema = z.object({
  screens: z.array(z.string()),
  drifts: z.array(tokenDriftSchema),
});
export type ScreenTokenDrift = z.infer<typeof screenTokenDriftSchema>;

/**
 * Compare what the screens declare against the design system's live values (pure). A token drifts when the
 * screens name it and give it a genuinely different value.
 *
 * Two exclusions, both deliberate:
 * - a token the user has explicitly SET is theirs — the design system drives the screens from then on, and
 *   re-proposing the screens' old value would pressure them to undo the edit they just made;
 * - a token the screens name but the design system doesn't have is the page's own vocabulary, not a change
 *   to the design system.
 */
export function computeTokenDrift(
  sections: LibrarySection[],
  screenTokens: Map<string, { value: string; screens: string[]; conflicts?: Array<{ screen: string; value: string }> }>,
  screens: string[],
  userSet: (token: string) => boolean,
): ScreenTokenDrift {
  const drifts: TokenDrift[] = [];
  for (const section of sections) {
    for (const row of section.rows) {
      const use = screenTokens.get(row.token);
      if (!use || userSet(row.token)) continue;
      if (row.value && sameDesignValue(row.value, use.value)) continue;
      drifts.push({
        token: row.token,
        designValue: row.value,
        screenValue: use.value,
        adoptValue: row.value ? applyLightDark(row.value, use.value) : use.value,
        screens: use.screens,
        ...(use.conflicts?.length ? { conflicts: use.conflicts } : {}),
      });
    }
  }
  return { screens, drifts };
}


/**
 * Re-resolve the preview with `drafts` (token → value) laid over the project's values.
 *
 * This is what lets the sample card move WHILE the user is typing, and what lets a preset be seen before
 * it is applied. Both are the same question — "what would this look like?" — asked before anything is
 * written, so neither should require a round-trip through disk.
 */
export function previewWithDrafts(preview: DesignPreview, drafts: Record<string, string>): DesignPreview {
  const keys = Object.keys(drafts);
  if (keys.length === 0) return preview;
  const norm = (n: string): string => n.replace(/^--/, "").trim().toLowerCase();
  const byToken = new Map(keys.map((k) => [norm(k), drafts[k]]));
  const out: DesignPreview = { ...preview, tokens: { ...preview.tokens } };
  for (const [role, token] of Object.entries(preview.tokens)) {
    const draft = byToken.get(norm(token));
    if (draft !== undefined && draft.trim() !== "") (out as Record<string, unknown>)[role] = draft;
  }
  return out;
}
