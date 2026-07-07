import { z } from "zod";

/**
 * Global, per-user profile — the only app-wide (not per-project) settings.
 * Persisted to `<userData>/profile.json`. Holds the user's display identity
 * (name + optional avatar image), used to address them by name when they talk to
 * the AI, plus their default intake preferences that pre-fill the setup wizard.
 * No credentials, no telemetry — identity and defaults only.
 */
export const profilePreferencesSchema = z.object({
  framework: z.string().optional(),
  language: z.string().optional(),
  styling: z.string().optional(),
  testRunner: z.string().optional(),
  /** A default Figma variable-collection name to pre-fill for Figma sources. */
  figmaTokenCollection: z.string().optional(),
});
export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;

export const profileSchema = z.object({
  /** Display name; used to address the user when they chat with the AI. */
  name: z.string().default(""),
  /** Optional avatar image as a data: URL (stored inline; no external fetch). */
  avatarDataUrl: z.string().nullable().default(null),
  /** Default answers that pre-fill the intake/setup wizard for new projects. */
  preferences: profilePreferencesSchema.default({}),
});
export type Profile = z.infer<typeof profileSchema>;

export const EMPTY_PROFILE: Profile = { name: "", avatarDataUrl: null, preferences: {} };
