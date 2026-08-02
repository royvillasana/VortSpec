import { z } from "zod";

/**
 * Design-VALUE primitives shared by every editing surface (change: design-system-style-panel).
 *
 * These answer four questions that come up wherever a design value is shown or written: what control does
 * this value want, is this value safe and well-formed to write, how do I edit one half of a `light-dark()`
 * pair without destroying the other, and are two differently-spelled values actually the same.
 *
 * They live apart from any panel's model because all of it is about the VALUE, not about how a particular
 * editor is organized — which is why they survived the lever panel being replaced.
 */

/** The declared kind of a value, used only as the fallback when there is no live value to refine from. */
export type StyleKind = "color" | "length" | "shadow" | "component";

/** The input rendered for a value. Derived from the LIVE value, so it can't mis-type. */
export const styleControlSchema = z.enum(["color", "length", "text", "component"]);
export type StyleControl = z.infer<typeof styleControlSchema>;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FN = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|light-dark)\(/i;
const LENGTH = /^-?(?:\d*\.)?\d+(?:px|rem|em|%|ch|vh|vw|pt)?$/i;
const VAR_REF = /^var\(\s*--[\w-]+/;
/** Anything that could break out of a declaration — never written, whatever the value. */
const UNSAFE = /[;{}<>]|\/\*|@import|expression\s*\(|url\s*\(/i;

/** True when `value` reads as a color (hex, functional notation, or a bare keyword). */
export function isColorValue(value: string): boolean {
  const v = value.trim();
  return HEX.test(v) || COLOR_FN.test(v) || (/^[a-z]+$/i.test(v) && v.toLowerCase() !== "none");
}

/**
 * Split a `light-dark(<light>, <dark>)` value — the modern one-declaration way to carry both modes, and
 * what a themed library like Astryx ships. Returns null for anything else. Top-level comma only, so a
 * nested `oklch(0 0 0 / 5%)` argument doesn't split wrongly.
 */
export function parseLightDark(value: string): { light: string; dark: string } | null {
  const m = value.trim().match(/^light-dark\(\s*([\s\S]*)\)$/i);
  if (!m) return null;
  let depth = 0;
  for (let i = 0; i < m[1].length; i++) {
    const c = m[1][i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      return { light: m[1].slice(0, i).trim(), dark: m[1].slice(i + 1).trim() };
    }
  }
  return null;
}

/**
 * Put `next` back where `original` held its LIGHT value, so editing the swatch of a `light-dark()` token
 * changes the light mode and leaves the dark one exactly as the library authored it. A plain value is
 * replaced outright.
 */
export function applyLightDark(original: string, next: string): string {
  const parts = parseLightDark(original);
  return parts ? `light-dark(${next}, ${parts.dark})` : next;
}

/** The hex a color swatch should show for `value` — its light half for `light-dark()`. Falls back to black. */
export function swatchHex(value: string): string {
  const v = (parseLightDark(value)?.light ?? value).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  // An 8-digit hex carries alpha a swatch can't show — drop it rather than render the wrong color.
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
  return "#000000";
}

/** True when `value` reads as a CSS length (a number with an optional unit, or `calc(…)`). */
export function isLengthValue(value: string): boolean {
  const v = value.trim();
  return LENGTH.test(v) || /^calc\(/i.test(v);
}

/**
 * The control for a value: the live value decides when there is one (a `--color-border` that really
 * holds a hex gets a color picker), otherwise the declared kind does. `var(--x)` references are edited as
 * text so an alias isn't silently flattened into a literal.
 */
export function controlFor(kind: StyleKind, value?: string): StyleControl {
  if (kind === "component") return "component";
  const v = (value ?? "").trim();
  if (v && !VAR_REF.test(v)) {
    if (isColorValue(v)) return "color";
    if (isLengthValue(v)) return "length";
    return "text";
  }
  if (v) return "text"; // a var() alias — keep it editable as text
  return kind === "color" ? "color" : kind === "length" ? "length" : "text";
}

/**
 * Validate a value before it is written. Rejects anything that could escape the declaration
 * it lands in, and holds a color/length control to its own shape. An EMPTY value is valid — it clears the
 * override (that's how `setTokenOverride`/`setComponentOverride` already remove an entry).
 */
export function isValidStyleValue(control: StyleControl, value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (UNSAFE.test(v)) return false;
  if (VAR_REF.test(v)) return /^var\(\s*--[\w-]+\s*(?:,[^()]*)?\)$/.test(v);
  // A `light-dark()` value is valid when BOTH halves are: editing one mode must not corrupt the other.
  const ld = parseLightDark(v);
  if (ld) return isValidStyleValue(control, ld.light) && isValidStyleValue(control, ld.dark);
  if (control === "color") return isColorValue(v);
  if (control === "length") return isLengthValue(v);
  return true;
}

/**
 * Are two design values the SAME value, written differently? Used to decide whether a screen has really
 * drifted from the design system, so cosmetic differences don't nag the user:
 *
 * - a `light-dark()` pair is compared on its LIGHT half (a light page renders light mode);
 * - hex is case- and shorthand-insensitive, and an opaque `…ff` alpha is noise;
 * - lengths compare numerically with `rem` resolved at the 16px root default, so the Astryx
 *   `--radius-container: 0.75rem` and a screen's `12px` are correctly the same value.
 */
export function sameDesignValue(a: string, b: string): boolean {
  return normDesignValue(a) === normDesignValue(b);
}

function normDesignValue(value: string): string {
  const v = (parseLightDark(value)?.light ?? value).trim().toLowerCase().replace(/\s+/g, " ");
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6);
    return `#${h}`;
  }
  const dim = v.match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (dim) return `len:${Number(dim[1]) * (dim[2] === "rem" || dim[2] === "em" ? 16 : 1)}`;
  return v;
}

