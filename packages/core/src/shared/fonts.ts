import { z } from "zod";

/**
 * Font families offered by the design-system editor (change: design-system-style-panel, Phase 3).
 *
 * A font family is a PICKED value, not typed text. Typing a name is how you silently end up with a
 * fallback: the name is either not installed, not fetched, or misspelled, and nothing says so — the type
 * just quietly stays as it was. So the picker offers real families from four sources and labels each,
 * because "installed on my machine" and "will be fetched" have very different consequences for the next
 * person who opens the project.
 */

export const fontSourceSchema = z.enum(["project", "system", "figma", "google"]);
export type FontSource = z.infer<typeof fontSourceSchema>;

export const fontFamilySchema = z.object({
  /** The family name as it is written in CSS, e.g. `Inter`. */
  family: z.string(),
  source: fontSourceSchema,
  /** Where it came from, when that is worth saying (the Figma file's name, the token's name). */
  detail: z.string().optional(),
});
export type FontFamily = z.infer<typeof fontFamilySchema>;

export const fontSourcesSchema = z.object({
  families: z.array(fontFamilySchema),
  /** True when the full Google catalog has been fetched; false means only the bundled set is present. */
  googleComplete: z.boolean(),
});
export type FontSources = z.infer<typeof fontSourcesSchema>;

/** Human label per source, used in the picker so a family's provenance is never a guess. */
export const FONT_SOURCE_LABEL: Record<FontSource, string> = {
  project: "In your design system",
  system: "Installed on this machine",
  figma: "From your Figma library",
  google: "Google Fonts",
};

/**
 * A curated head of the Google catalog — the families people actually reach for — bundled so the picker
 * opens instantly and works with no network. The rest of the catalog is fetched only when the user looks
 * past this set, which is the case that genuinely needs it.
 */
export const GOOGLE_FONTS_BUNDLED: string[] = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans 3", "Raleway",
  "Nunito", "Nunito Sans", "Work Sans", "Rubik", "Karla", "Manrope", "DM Sans", "Plus Jakarta Sans",
  "Figtree", "Outfit", "Sora", "Space Grotesk", "Urbanist", "Epilogue", "Public Sans", "Mulish",
  "Barlow", "Cabin", "Quicksand", "Josefin Sans", "Oswald", "Bebas Neue", "Anton", "Archivo",
  "Archivo Black", "Chivo", "Heebo", "Hind", "Asap", "Assistant", "Overpass", "Red Hat Display",
  "Libre Franklin", "IBM Plex Sans", "IBM Plex Mono", "IBM Plex Serif", "Fira Sans", "Fira Code",
  "JetBrains Mono", "Source Code Pro", "Space Mono", "Roboto Mono", "Inconsolata", "Ubuntu",
  "Ubuntu Mono", "Merriweather", "Playfair Display", "Lora", "PT Serif", "PT Sans", "Crimson Text",
  "Libre Baskerville", "Cormorant Garamond", "EB Garamond", "Bitter", "Zilla Slab", "Arvo",
  "Domine", "Vollkorn", "Spectral", "Newsreader", "Fraunces", "Instrument Sans", "Geist",
];

/**
 * Families that ship with the OS, offered when `queryLocalFonts()` is unavailable or declined.
 *
 * VortSpec deliberately does NOT install a global Electron permission handler to force the Local Font
 * Access API through: a handler changes the default for EVERY permission from grant-most to deny-most,
 * which would silently break clipboard, media and the rest. A shorter system list is a far better trade
 * than a permissions regression, and the other three sources are unaffected either way.
 */
export const SYSTEM_FONT_FALLBACKS: string[] = [
  "system-ui", "-apple-system", "Helvetica Neue", "Arial", "Georgia", "Times New Roman",
  "Courier New", "Verdana", "Tahoma", "Trebuchet MS", "Menlo", "Consolas",
];

/**
 * Quote a family name only when CSS requires it — a name with spaces or punctuation.
 *
 * A bare CSS identifier MAY start with a hyphen (`-apple-system`), and quoting one is not merely ugly:
 * `"-apple-system"` is matched as a literal family name that does not exist, so the fallback it was meant
 * to provide silently stops working.
 */
function quoted(family: string): string {
  return /^-?[a-zA-Z][a-zA-Z0-9-]*$/.test(family) ? family : `"${family}"`;
}

/**
 * The CSS value written for a chosen family: the family FIRST, then a system fallback chain.
 *
 * The fallback is not decoration. A system family may not exist on the next machine and a Google family
 * may be blocked or offline, and in both cases the page still has to be readable — the stack is what makes
 * a failed font a cosmetic problem instead of a broken screen.
 */
export function fontStack(family: string, mono = false): string {
  const tail = mono
    ? ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
    : ["system-ui", "-apple-system", "Segoe UI", "sans-serif"];
  const rest = tail.filter((f) => f.toLowerCase() !== family.toLowerCase()).map(quoted);
  return [quoted(family), ...rest].join(", ");
}

/** The leading family of a stack — what a picker should show as "currently chosen". */
export function leadFamily(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^['"]|['"]$/g, "");
}

/** True when the value looks like a font family/stack rather than a size or weight. */
export function isFontFamilyValue(value: string): boolean {
  const v = value.trim();
  if (!v || /^\d/.test(v)) return false;
  return /[a-z]/i.test(v) && !/^(?:\d|calc|var)/i.test(v);
}

/**
 * The stylesheet URL that loads a Google family. Emitted only when a Google family is actually chosen, so
 * a project that never picks one keeps its pages free of any network dependency.
 */
export function googleFontUrl(families: string[], weights = [400, 500, 600, 700]): string | null {
  const list = families.filter((f) => f.trim()).map((f) => `family=${encodeURIComponent(f.trim()).replace(/%20/g, "+")}:wght@${weights.join(";")}`);
  return list.length ? `https://fonts.googleapis.com/css2?${list.join("&")}&display=swap` : null;
}
