import { z } from "zod";

/**
 * The durable, project-scoped design-system personalization overlay
 * (change: consume-component-libraries). Stored at `.vortspec/theme-overrides.json`, it is the
 * single source of truth for a user's token/theme edits, layered on top of the project's real
 * token source at read time and MATERIALIZED per source at consumption time (CSS vars, a generated
 * theme config, an Astryx runtime override, or an enterprise overlay). Keeping edits here — rather
 * than always mutating the token file in place — is what lets personalization work for ANY component
 * regardless of how it entered VortSpec, and never touches a consumed source's real files.
 */

/** A flat bag of style/token declarations, e.g. `{ "background": "var(--primary)", "color": "#fff" }`. */
export const declBagSchema = z.record(z.string(), z.string());
export type DeclBag = z.infer<typeof declBagSchema>;

/**
 * A single component's overrides, keyed richly (the "full per-slot/per-variant" model):
 * - `base` applies to every instance;
 * - `variants[axis][option]` targets one variant option (e.g. `variant.ghost`, `size.lg`);
 * - `slots[slot]` targets one internal slot (e.g. MUI `root`/`label`, a slot recipe part).
 */
export const componentOverrideSchema = z.object({
  base: declBagSchema.optional(),
  variants: z.record(z.string(), z.record(z.string(), declBagSchema)).optional(),
  slots: z.record(z.string(), declBagSchema).optional(),
});
export type ComponentOverride = z.infer<typeof componentOverrideSchema>;

/** A global token override — a new value, optionally scoped to a theme mode (e.g. `dark`). */
export const tokenOverrideSchema = z.object({
  value: z.string(),
  mode: z.string().optional(),
  /**
   * Who put this value here (change: design-system-style-panel, Phase 4).
   *
   * `preset` means a preset apply wrote it; `user` (the default) means the person did. The distinction is
   * what makes "go back to Default" precise rather than destructive: returning to the source design system
   * removes only what a preset contributed, leaving the user's own personalization intact. Editing a
   * preset-written token in Manual mode transfers it to `user` — they have taken it over.
   */
  origin: z.enum(["user", "preset"]).optional(),
});
export type TokenOverride = z.infer<typeof tokenOverrideSchema>;

export const themeOverridesSchema = z.object({
  version: z.literal(1).default(1),
  /** Global token overrides, keyed by token name (without the leading `--`). */
  tokens: z.record(z.string(), tokenOverrideSchema).default({}),
  /** Per-component overrides, keyed by `data-component` name. */
  components: z.record(z.string(), componentOverrideSchema).default({}),
  /**
   * Google Fonts families the user has CHOSEN. Recorded separately from the token values because picking a
   * family is only half the job — the family also has to be FETCHED, and the stylesheet link is emitted
   * from this list. A project that never picks one keeps its pages free of any network dependency.
   */
  googleFonts: z.array(z.string()).default([]),
});
export type ThemeOverrides = z.infer<typeof themeOverridesSchema>;

export const EMPTY_THEME_OVERRIDES: ThemeOverrides = { version: 1, tokens: {}, components: {}, googleFonts: [] };

/** Parse raw JSON into a valid overlay, falling back to empty on any malformed input. */
export function parseThemeOverrides(raw: unknown): ThemeOverrides {
  const r = themeOverridesSchema.safeParse(raw);
  return r.success ? r.data : { ...EMPTY_THEME_OVERRIDES };
}

/** Set a global token override (immutably); an empty value REMOVES the override. */
export function setTokenOverride(
  overrides: ThemeOverrides,
  name: string,
  value: string,
  mode?: string,
  origin: "user" | "preset" = "user",
): ThemeOverrides {
  const key = name.replace(/^--/, "");
  const tokens = { ...overrides.tokens };
  if (value.trim() === "") delete tokens[key];
  else tokens[key] = { value, ...(mode ? { mode } : {}), origin };
  return { ...overrides, tokens };
}

/**
 * Drop every value a preset contributed, so the project's SOURCE design system is in effect again — what
 * selecting "Default" means. The user's own edits survive, including edits they made to a token a preset
 * had written (those became theirs at the moment they touched them).
 */
export function clearPresetTokens(overrides: ThemeOverrides): ThemeOverrides {
  const tokens: Record<string, TokenOverride> = {};
  for (const [k, v] of Object.entries(overrides.tokens)) if (v.origin !== "preset") tokens[k] = v;
  return { ...overrides, tokens };
}

/**
 * Set a per-component override at a target (immutably). `target` selects where it lands:
 * `{ }` → base; `{ variant, option }` → a variant option; `{ slot }` → a slot. An empty `decls`
 * bag clears that target.
 */
export function setComponentOverride(
  overrides: ThemeOverrides,
  component: string,
  target: { variant?: string; option?: string; slot?: string },
  decls: DeclBag,
): ThemeOverrides {
  const components = { ...overrides.components };
  const cur: ComponentOverride = { ...(components[component] ?? {}) };
  const has = Object.keys(decls).length > 0;

  if (target.slot) {
    const slots = { ...(cur.slots ?? {}) };
    if (has) slots[target.slot] = decls;
    else delete slots[target.slot];
    cur.slots = Object.keys(slots).length ? slots : undefined;
  } else if (target.variant && target.option) {
    const variants = { ...(cur.variants ?? {}) };
    const axis = { ...(variants[target.variant] ?? {}) };
    if (has) axis[target.option] = decls;
    else delete axis[target.option];
    if (Object.keys(axis).length) variants[target.variant] = axis;
    else delete variants[target.variant];
    cur.variants = Object.keys(variants).length ? variants : undefined;
  } else {
    cur.base = has ? decls : undefined;
  }

  // Drop the component entry entirely if it now carries nothing.
  if (!cur.base && !cur.variants && !cur.slots) delete components[component];
  else components[component] = cur;
  return { ...overrides, components };
}

/** Record a chosen Google family (immutably), so its stylesheet is emitted wherever the design system renders. */
export function addGoogleFont(overrides: ThemeOverrides, family: string): ThemeOverrides {
  const f = family.trim();
  if (!f || (overrides.googleFonts ?? []).some((x) => x.toLowerCase() === f.toLowerCase())) return overrides;
  return { ...overrides, googleFonts: [...(overrides.googleFonts ?? []), f] };
}
