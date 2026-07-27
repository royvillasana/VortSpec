/**
 * Main-process orchestrator for the lightweight design system (OpenSpec change: light-design-system).
 * Turns the REAL project sources into the lite manifest + palette by reusing VortSpec's existing
 * readers — `getInspectorTokens` (resolved token values) and `getInspectorComponents` (the contract
 * from `.sdd-de/components.json` + source) — then feeds the pure `deriveLiteManifest`/`buildPalette`
 * transforms. No new Figma read; no new parser.
 *
 * The mapping from the inspector shapes → the derive input is kept PURE (`buildDeriveInput`) so it is
 * unit-testable without the fs; the `*Project*` functions are the thin fs wrappers.
 */
import { basename, join } from "node:path";
import { writeFile, readFile, readdir } from "node:fs/promises";
import { getInspectorTokens } from "../inspector/token-parser";
import { getInspectorComponents } from "../inspector/component-reader";
import {
  deriveLiteManifest,
  serializeLiteManifest,
  findFrameworkPointers,
  type DeriveInput,
  type LiteManifest,
  type StandIn,
  type TokenGroup,
  type ComponentTier,
} from "../../shared/lite-manifest";
import { buildPalette, renderPaletteHtml } from "../../shared/palette";
import { LIGHT_HTML_DIR, normSegment } from "../../shared/light-standin";

/** Map an inspector token `type` (singular) to a manifest token group (plural); null ⇒ skip. */
export function mapTokenGroup(type: string): TokenGroup | null {
  switch (type) {
    case "color":
      return "colors";
    case "typography":
      return "typography";
    case "spacing":
      return "spacing";
    case "shadow":
      return "shadows";
    case "radius":
      return "radius";
    default:
      return null; // e.g. "other" — not a visual group the palette renders
  }
}

/** Normalize a detected `level` to a contract tier; unknown ⇒ atom (safe default). */
export function mapTier(level: string | undefined): ComponentTier {
  switch (level) {
    case "molecule":
      return "molecule";
    case "organism":
      return "organism";
    case "template":
      return "template";
    default:
      return "atom";
  }
}

/** A prop control (structural subset of the inspector's PropControl) the mapping reads. */
interface PropLike {
  key: string;
  kind: string;
  options: string[];
  defaultValue?: string;
}

/** The variant axis: the options of a prop literally named `variant` (the CVA convention); else none. */
function variantsOf(props: PropLike[]): string[] {
  const variant = props.find((p) => p.key.toLowerCase() === "variant" && p.kind === "enum");
  return variant?.options ?? [];
}

/**
 * Pure mapping: inspector tokens + components → the `deriveLiteManifest` input. Tokens become
 * dual-key entries (name + resolvedValue) grouped by kind; components carry tier, variants, and props.
 * Stand-ins are left to harvest/placeholder (not set here).
 */
export function buildDeriveInput(
  projectName: string,
  tokens: { name: string; type: string; resolvedValue: string }[],
  components: { name: string; level?: string; props: PropLike[] }[],
): DeriveInput {
  const mapped: DeriveInput["tokens"] = [];
  for (const t of tokens) {
    const group = mapTokenGroup(t.type);
    if (group && t.resolvedValue) mapped.push({ name: t.name, value: t.resolvedValue, group });
  }
  return {
    projectName,
    tokens: mapped,
    components: components.map((c) => ({
      name: c.name,
      tier: mapTier(c.level),
      variants: variantsOf(c.props),
      props: c.props.map((p) => ({ name: p.key, type: p.kind, default: p.defaultValue })),
    })),
  };
}

/**
 * Read the Figma-derived stand-ins the agent wrote under `.vortspec/light-html/<component>/<variant>.html`
 * (light-standin.ts). Keyed by the NORMALIZED component segment so the caller can join by component name.
 * A stand-in that leaked a framework pointer is skipped (never shown as a light-only-world preview).
 */
export async function readFigmaStandIns(projectPath: string): Promise<Record<string, StandIn[]>> {
  const root = join(projectPath, LIGHT_HTML_DIR);
  const out: Record<string, StandIn[]> = {};
  let comps: string[];
  try {
    comps = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return out; // no light-html dir yet — palette falls back to placeholders
  }
  for (const comp of comps) {
    const standIns: StandIn[] = [];
    let files: string[];
    try {
      files = (await readdir(join(root, comp))).filter((f) => f.endsWith(".html"));
    } catch {
      continue;
    }
    for (const file of files.sort()) {
      const html = (await readFile(join(root, comp, file), "utf8").catch(() => "")).trim();
      if (!html || findFrameworkPointers(html).length > 0) continue;
      standIns.push({ variant: file.replace(/\.html$/, ""), html, source: "harvested" });
    }
    if (standIns.length > 0) out[comp] = standIns;
  }
  return out;
}

/** Read the real project sources and derive the in-memory lite manifest (with Figma stand-ins if present). */
export async function deriveProjectLiteManifest(projectPath: string): Promise<LiteManifest> {
  const [tokensResult, componentsResult, figmaStandIns] = await Promise.all([
    getInspectorTokens(projectPath),
    getInspectorComponents(projectPath),
    readFigmaStandIns(projectPath),
  ]);
  const input = buildDeriveInput(basename(projectPath) || "Project", tokensResult.tokens, componentsResult.components);
  // Join stand-ins to components by the normalized segment (matches how light-standin wrote them).
  const standIns: Record<string, StandIn[]> = {};
  for (const c of input.components) {
    const hit = figmaStandIns[normSegment(c.name)];
    if (hit) standIns[c.name] = hit;
  }
  input.standIns = standIns;
  return deriveLiteManifest(input);
}

/** Derive the manifest and render the browsable palette HTML (what the IDE "Design System" view embeds). */
export async function getProjectPaletteHtml(projectPath: string): Promise<string> {
  return renderPaletteHtml(buildPalette(await deriveProjectLiteManifest(projectPath)));
}

/** Write `designer.md` (the light-authoring manifest) to the project root; returns its path. */
export async function writeDesignerMd(projectPath: string): Promise<string> {
  const text = serializeLiteManifest(await deriveProjectLiteManifest(projectPath));
  const path = join(projectPath, "designer.md");
  await writeFile(path, text, "utf8");
  return path;
}
