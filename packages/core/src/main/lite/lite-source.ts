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
import { readFigmaComponents } from "../inspector/figma-reconcile";
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
import { LIGHT_HTML_DIR, normSegment, buildLightStandInPrompt, type StandInTarget } from "../../shared/light-standin";
import { detectedComponentsSchema } from "../../shared/flow";

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
/**
 * Strip document-level shell + global styles from a stand-in so it can't hijack the palette. A Figma
 * stand-in emitted as a full document (`<html>`, `<head><style>body{...}</style>`, `<body ...>`) would
 * otherwise leak a page background / global rules into the palette (that's the "grid updated but colors
 * stayed light" symptom). We keep the visible markup + inline styles; document shell, <style>, <head>,
 * <script>, <link>, <meta>, <title> are removed.
 */
export function sanitizeStandInHtml(html: string): string {
  return html
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(?:link|meta)[^>]*>/gi, "")
    .replace(/<title[\s\S]*?<\/title>/gi, "")
    .trim();
}

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
      const raw = (await readFile(join(root, comp, file), "utf8").catch(() => "")).trim();
      const html = sanitizeStandInHtml(raw);
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
  // A light-first design system shows ALL designed components — include Figma components that aren't
  // coded yet (`figmaOnly`) alongside the code roster, so the palette reflects the whole design system.
  const figmaOnly = componentsResult.figmaOnly.map((f) => ({ name: f.name, props: [] as { key: string; kind: string; options: string[]; defaultValue?: string }[] }));
  const components = [...componentsResult.components, ...figmaOnly];
  const input = buildDeriveInput(basename(projectPath) || "Project", tokensResult.tokens, components);
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
  const html = renderPaletteHtml(buildPalette(await deriveProjectLiteManifest(projectPath)));
  // Debug (temporary): confirm at RUNTIME what we actually generate. `stray*` > 1 means a stand-in
  // leaked document-level tags/styles into the palette (the light-chrome symptom).
  console.error(
    `[lite:palette] len=${html.length} rootDark=${/:root\{color-scheme:dark/.test(html)} ` +
      `strayStyle=${(html.match(/<style/gi) || []).length} strayBody=${(html.match(/<body/gi) || []).length} ` +
      `strayHtml=${(html.match(/<html/gi) || []).length}`,
  );
  return html;
}

/** Write `designer.md` (the light-authoring manifest) to the project root; returns its path. */
export async function writeDesignerMd(projectPath: string): Promise<string> {
  const text = serializeLiteManifest(await deriveProjectLiteManifest(projectPath));
  const path = join(projectPath, "designer.md");
  await writeFile(path, text, "utf8");
  return path;
}

/**
 * Stand-in targets = every design-system component with its Figma ref. Sourced from the SAME places
 * the palette shows components: the code roster (variant VALUES from enum props) PLUS Figma components
 * not yet coded (`figmaOnly`). Figma refs (node id / componentKey) come from `.vortspec/figma-components.json`
 * — matched to code components by name — with `.sdd-de/components.json` as a fallback. This is why the
 * earlier prompt was empty: it read only `.sdd-de/components.json`, which was empty for this project.
 */
export async function buildStandInTargets(projectPath: string): Promise<StandInTarget[]> {
  const [componentsResult, figmaAll, raw] = await Promise.all([
    getInspectorComponents(projectPath),
    readFigmaComponents(projectPath),
    readFile(join(projectPath, ".sdd-de/components.json"), "utf8").catch(() => ""),
  ]);
  const key = (s: string) => normSegment(s).toLowerCase();
  const figByName = new Map((figmaAll ?? []).map((f) => [key(f.name), f]));
  // Fallback refs from the detected inventory (.sdd-de/components.json), if present.
  if (raw) {
    try {
      const parsed = detectedComponentsSchema.safeParse(JSON.parse(raw));
      if (parsed.success)
        for (const d of parsed.data) {
          const k = key(d.name);
          if (!figByName.has(k) && (d.figmaNodeId || d.nodeId || d.componentKey))
            figByName.set(k, { name: d.name, isSet: false, variants: [], id: d.figmaNodeId ?? d.nodeId, key: d.componentKey });
        }
    } catch {
      /* malformed → rely on figma-components.json only */
    }
  }

  const targets: StandInTarget[] = [];
  const seen = new Set<string>();
  for (const c of componentsResult.components) {
    seen.add(key(c.name));
    const f = figByName.get(key(c.name));
    targets.push({ name: c.name, figmaNodeId: f?.id, componentKey: f?.key, variants: variantsOf(c.props) });
  }
  // Figma-designed components not (yet) in the code roster — the light-first case.
  for (const f of figmaAll ?? []) {
    if (seen.has(key(f.name))) continue;
    targets.push({ name: f.name, figmaNodeId: f.id, componentKey: f.key, variants: f.variants ?? [] });
  }
  return targets;
}

/**
 * Build the agent prompt that generates Figma-derived light stand-ins for the whole project (task 3.1).
 * The renderer runs this via the existing agent-run machinery (`useAgentRun`) so the Figma MCP is used
 * by the agent, not by VortSpec core.
 */
export async function buildProjectStandInPrompt(projectPath: string): Promise<string> {
  const targets = await buildStandInTargets(projectPath);
  const withRefs = targets.filter((t) => t.figmaNodeId || t.componentKey);
  return buildLightStandInPrompt(withRefs.length > 0 ? withRefs : targets);
}
