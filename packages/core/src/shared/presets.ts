import { z } from "zod";
import { fontStack } from "@vortspec/core/fonts";

/**
 * Design-system presets (change: design-system-style-panel, Phase 4).
 *
 * **Default is not a preset.** It is the design system the project already HAS, straight from its source —
 * a consumed library's own values, or the connected Figma file's. Nothing is authored or stored for it.
 * Selecting it puts the source's values back by removing what a preset contributed.
 *
 * The built-ins below ARE stored, but read-only and shipped with the app. Applying one writes its values
 * through the durable overlay; editing afterwards edits the PROJECT, never the preset — a built-in is a
 * starting point, not a live binding.
 *
 * A preset is keyed by ROLE, never by raw token name, so it stays applicable to a project whose tokens are
 * named differently. Resolution to this project's actual tokens happens only at APPLY time, which is what
 * keeps a mis-resolved role from ever affecting the panel's ability to show and edit a token.
 */

/** The roles a preset can carry. Deliberately small — these are the decisions that define a look. */
export const presetRoleSchema = z.enum([
  "color.primary",
  "color.secondary",
  "color.tertiary",
  "color.background",
  "color.surface",
  "font.family",
  "radius.base",
  "shadow.base",
]);
export type PresetRole = z.infer<typeof presetRoleSchema>;

/** A role's value. `dark` is present for colors so a `light-dark()` token keeps both of its modes. */
export const presetValueSchema = z.object({
  light: z.string(),
  dark: z.string().optional(),
});
export type PresetValue = z.infer<typeof presetValueSchema>;

export const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** One line under the name in the list, e.g. `Inter · Purple · 8px`. */
  summary: z.string(),
  /** Built-ins ship with the app and are never edited by a project. */
  builtIn: z.boolean().default(false),
  /** A Google family this preset's type needs fetching for. */
  googleFont: z.string().optional(),
  values: z.record(presetRoleSchema, presetValueSchema),
});
export type Preset = z.infer<typeof presetSchema>;

/** What the panel shows: Default, the built-ins, the user's own — with exactly one active. */
export const presetListSchema = z.object({
  presets: z.array(presetSchema),
  /** `null` means Default — the project's own source design system — is in effect. */
  activeId: z.string().nullable(),
});
export type PresetList = z.infer<typeof presetListSchema>;

/**
 * The token-name candidates each role resolves against, most-conventional first. A role binds ONLY to a
 * token the project genuinely has; one that resolves to nothing is skipped and reported, never invented.
 */
export const ROLE_CANDIDATES: Record<PresetRole, string[]> = {
  "color.primary": ["color-primary", "primary", "color-accent", "accent", "brand-primary", "color-brand"],
  "color.secondary": ["color-secondary", "secondary", "color-accent-muted", "brand-secondary"],
  "color.tertiary": ["color-tertiary", "tertiary"],
  "color.background": ["color-background", "background", "color-background-body", "color-bg"],
  "color.surface": ["color-surface", "surface", "color-background-surface", "color-background-card"],
  "font.family": ["font-family-body", "font-family-base", "font-family", "font-body", "font-sans"],
  "radius.base": ["radius-card", "radius-container", "radius-base", "radius-md", "radius"],
  "shadow.base": ["shadow-base", "shadow-md", "shadow-med", "shadow-default", "shadow"],
};

/** Roles a preset may CREATE when the project has no token for them — the type scale is the motivating case. */
export const INTRODUCIBLE: Partial<Record<PresetRole, string>> = {
  "font.family": "font-family-body",
  "radius.base": "radius-base",
  "shadow.base": "shadow-base",
};

const scale = (font: string, google: string, radius: string, c: Record<string, [string, string]>, shadow: string): Preset["values"] => ({
  "color.primary": { light: c.primary[0], dark: c.primary[1] },
  "color.secondary": { light: c.secondary[0], dark: c.secondary[1] },
  "color.tertiary": { light: c.tertiary[0], dark: c.tertiary[1] },
  "color.background": { light: c.background[0], dark: c.background[1] },
  "color.surface": { light: c.surface[0], dark: c.surface[1] },
  "font.family": { light: fontStack(google) },
  "radius.base": { light: radius },
  "shadow.base": { light: shadow },
});

/**
 * The built-ins. Colours carry light AND dark so applying one to a `light-dark()` project keeps both
 * modes rather than flattening it to whichever the preset happened to state.
 */
export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: "ocean",
    name: "Ocean",
    summary: "SF Pro · Blue · 4px",
    builtIn: true,
    values: scale("SF Pro Text", "SF Pro Text", "4px", {
      primary: ["#0A84FF", "#4DA3FF"],
      secondary: ["#5AC8FA", "#7FD8FB"],
      tertiary: ["#64D2FF", "#8ADEFF"],
      background: ["#F5F9FC", "#0B1620"],
      surface: ["#FFFFFF", "#12222E"],
    }, "0 4px 12px rgba(0, 0, 0, 0.12)"),
  },
  {
    id: "forest",
    name: "Forest",
    summary: "Poppins · Earth · 12px",
    builtIn: true,
    googleFont: "Poppins",
    values: scale("Poppins", "Poppins", "12px", {
      primary: ["#2E7D5B", "#5FA882"],
      secondary: ["#8AA86B", "#A8C089"],
      tertiary: ["#C7A15A", "#D8BA82"],
      background: ["#F7F8F3", "#12170F"],
      surface: ["#FFFFFF", "#1B2318"],
    }, "0 4px 12px rgba(0, 0, 0, 0.10)"),
  },
  {
    id: "sunset",
    name: "Sunset",
    summary: "Montserrat · Coral · 6px",
    builtIn: true,
    googleFont: "Montserrat",
    values: scale("Montserrat", "Montserrat", "6px", {
      primary: ["#FF6B4A", "#FF8A6E"],
      secondary: ["#FFA24C", "#FFB877"],
      tertiary: ["#FF4D6D", "#FF7A93"],
      background: ["#FFF7F4", "#1A1013"],
      surface: ["#FFFFFF", "#241619"],
    }, "0 4px 12px rgba(0, 0, 0, 0.12)"),
  },
];

// ── Applying ──────────────────────────────────────────────────────────────────

/** What one role will do to this project — computed BEFORE anything is written. */
export const roleOutcomeSchema = z.object({
  role: presetRoleSchema,
  /** The token this role resolved to; absent when it resolved to nothing. */
  token: z.string().optional(),
  /** The value that will be written. */
  value: z.string().optional(),
  /** The value the token holds now, for a before/after read. */
  currentValue: z.string().optional(),
  /** `change` rewrites an existing token, `introduce` creates one, `skip` cannot be expressed here. */
  outcome: z.enum(["change", "introduce", "skip"]),
});
export type RoleOutcome = z.infer<typeof roleOutcomeSchema>;

export const presetPlanSchema = z.object({
  presetId: z.string(),
  outcomes: z.array(roleOutcomeSchema),
  /**
   * How the design system's Live Preview would look with this preset applied — computed before anything
   * is written, so the user judges a preset by SEEING it rather than by reading a list of hex values.
   */
  preview: z.record(z.string(), z.unknown()).optional(),
});
export type PresetPlan = z.infer<typeof presetPlanSchema>;

/**
 * Work out exactly what applying `preset` would do to this project, so it can be SHOWN before it is done.
 * One click rewrites many tokens at once; discovering which ones afterwards is not good enough.
 *
 * A role resolves to the first of its candidates the project actually has. Failing that, a role in
 * {@link INTRODUCIBLE} is created — that is how a project whose library defines no type scale gets one —
 * and anything else is skipped and reported.
 */
export function planPreset(
  preset: Preset,
  tokens: Array<{ name: string; value: string }>,
  isLightDark: (value: string) => { light: string; dark: string } | null,
  compose: (current: string, next: string) => string,
): PresetPlan {
  const byName = new Map(tokens.map((t) => [norm(t.name), t]));
  const outcomes: RoleOutcome[] = [];

  for (const [role, value] of Object.entries(preset.values) as Array<[PresetRole, PresetValue]>) {
    const hit = (ROLE_CANDIDATES[role] ?? []).map((c) => byName.get(norm(c))).find(Boolean);
    if (hit) {
      // A `light-dark()` token keeps its dark half — from the preset when it states one, else the token's.
      const pair = isLightDark(hit.value);
      const next = pair && value.dark ? `light-dark(${value.light}, ${value.dark})` : compose(hit.value, value.light);
      outcomes.push({ role, token: hit.name, value: next, currentValue: hit.value, outcome: "change" });
      continue;
    }
    const introduce = INTRODUCIBLE[role];
    if (introduce) {
      outcomes.push({ role, token: introduce, value: value.light, outcome: "introduce" });
      continue;
    }
    outcomes.push({ role, outcome: "skip" });
  }
  return { presetId: preset.id, outcomes };
}

function norm(name: string): string {
  return name.replace(/^--/, "").trim().toLowerCase().replace(/[\s/._]+/g, "-").replace(/-+/g, "-");
}
