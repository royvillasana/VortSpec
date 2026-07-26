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
import { writeFile } from "node:fs/promises";
import { getInspectorTokens } from "../inspector/token-parser";
import { getInspectorComponents } from "../inspector/component-reader";
import type { InspectorToken, InspectorComponent } from "../../shared/inspector";
import {
  deriveLiteManifest,
  serializeLiteManifest,
  type DeriveInput,
  type LiteManifest,
  type TokenGroup,
  type ComponentTier,
} from "../../shared/lite-manifest";
import { buildPalette, renderPaletteHtml } from "../../shared/palette";

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

/** The variant axis: the options of a prop literally named `variant` (the CVA convention); else none. */
function variantsOf(component: Pick<InspectorComponent, "props">): string[] {
  const variant = component.props.find((p) => p.key.toLowerCase() === "variant" && p.kind === "enum");
  return variant?.options ?? [];
}

/**
 * Pure mapping: inspector tokens + components → the `deriveLiteManifest` input. Tokens become
 * dual-key entries (name + resolvedValue) grouped by kind; components carry tier, variants, and props.
 * Stand-ins are left to harvest/placeholder (not set here).
 */
export function buildDeriveInput(
  projectName: string,
  tokens: Pick<InspectorToken, "name" | "type" | "resolvedValue">[],
  components: Pick<InspectorComponent, "name" | "level" | "props">[],
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
      variants: variantsOf(c),
      props: c.props.map((p) => ({ name: p.key, type: p.kind, default: p.defaultValue })),
    })),
  };
}

/** Read the real project sources and derive the in-memory lite manifest. */
export async function deriveProjectLiteManifest(projectPath: string): Promise<LiteManifest> {
  const [tokensResult, componentsResult] = await Promise.all([
    getInspectorTokens(projectPath),
    getInspectorComponents(projectPath),
  ]);
  const input = buildDeriveInput(basename(projectPath) || "Project", tokensResult.tokens, componentsResult.components);
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
