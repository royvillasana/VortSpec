import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BUILT_IN_PRESETS,
  planPreset,
  presetSchema,
  type Preset,
  type PresetList,
  type PresetPlan,
} from "@vortspec/core/presets";
import { applyLightDark, parseLightDark } from "@vortspec/core/style-values";
import { resolvePreview } from "@vortspec/core/design-library";
import type { InspectorToken } from "@vortspec/core/inspector";
import { addGoogleFont, clearPresetTokens, setTokenOverride } from "@vortspec/core/theme-overrides";
import { getInspectorTokens } from "./token-parser";
import { readThemeOverrides, writeThemeOverridesFile } from "./theme-override-store";

/**
 * Presets: the built-ins, the user's own, and applying one (change: design-system-style-panel, Phase 4).
 *
 * **Default is not in this store.** It is the project's own source design system — the consumed library's
 * values, or the Figma file's — and nothing is authored for it. `activeId: null` means Default is in
 * effect, and selecting it clears the preset-written entries so the source shows through again.
 */

const PRESETS_PATH = ".vortspec/presets.json";

interface PresetFile {
  presets: Preset[];
  activeId: string | null;
}

async function readFileJson(projectPath: string): Promise<PresetFile> {
  try {
    const raw = JSON.parse(await readFile(join(projectPath, PRESETS_PATH), "utf8")) as PresetFile;
    return {
      presets: (raw.presets ?? []).map((p) => presetSchema.safeParse(p)).flatMap((r) => (r.success ? [r.data] : [])),
      activeId: raw.activeId ?? null,
    };
  } catch {
    return { presets: [], activeId: null };
  }
}

async function writeFileJson(projectPath: string, file: PresetFile): Promise<void> {
  const p = join(projectPath, PRESETS_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(file, null, 2)}\n`);
}

/** The built-ins plus this project's own presets, and which one is active (`null` = Default). */
export async function listPresets(projectPath: string): Promise<PresetList> {
  const file = await readFileJson(projectPath);
  return { presets: [...BUILT_IN_PRESETS, ...file.presets], activeId: file.activeId };
}

/** Look a preset up by id across built-ins and the project's own. */
async function findPreset(projectPath: string, id: string): Promise<Preset | null> {
  const { presets } = await listPresets(projectPath);
  return presets.find((p) => p.id === id) ?? null;
}

/**
 * What applying `presetId` would do — computed against this project's real tokens, before anything is
 * written, so the change can be shown first. One click rewrites many tokens; finding out afterwards which
 * ones moved is not good enough.
 */
export async function previewPreset(projectPath: string, presetId: string): Promise<PresetPlan> {
  const preset = await findPreset(projectPath, presetId);
  if (!preset) return { presetId, outcomes: [] };
  const tokens = await getInspectorTokens(projectPath).catch(() => null);
  const rows = tokens?.tokens ?? [];
  const plan = planPreset(
    preset,
    rows.map((t) => ({ name: t.name, value: t.resolvedValue })),
    parseLightDark,
    applyLightDark,
  );

  // Project the plan onto the token list and re-resolve the preview, so the caller can SHOW how the
  // design system would look rather than list the hex values that would change. An introduced role has
  // no token yet, so it is added to the projection — otherwise a preset that brings a type scale would
  // preview without it.
  const projected = rows.map((t) => ({ ...t }));
  for (const o of plan.outcomes) {
    if (o.outcome === "skip" || !o.token || o.value === undefined) continue;
    const hit = projected.find((t) => t.name.toLowerCase() === o.token!.toLowerCase());
    if (hit) hit.resolvedValue = o.value;
    else projected.push({ ...INTRODUCED_STUB, name: o.token, rawValue: o.value, resolvedValue: o.value, type: typeForRole(o.role) });
  }
  return { ...plan, preview: resolvePreview(projected) };
}

/** The shape an introduced token takes in the projection — it exists only to be previewed. */
const INTRODUCED_STUB = { source: "hand-edited", uses: 0 } as unknown as InspectorToken;

/** The token type a preset role writes, so an introduced token lands in the right preview slot. */
function typeForRole(role: string): InspectorToken["type"] {
  if (role.startsWith("color.")) return "color";
  if (role.startsWith("radius.")) return "radius";
  if (role.startsWith("shadow.")) return "shadow";
  return "typography";
}

/**
 * Apply a preset: write every role that resolved, mark it active, and RETURN the plan so the caller can
 * report what changed, what was newly introduced, and what this project could not express.
 *
 * Writes are tagged `preset`, which is what lets a later return to Default undo exactly this and nothing
 * else.
 */
export async function applyPreset(projectPath: string, presetId: string): Promise<PresetPlan> {
  const preset = await findPreset(projectPath, presetId);
  if (!preset) return { presetId, outcomes: [] };
  const plan = await previewPreset(projectPath, presetId);

  let overrides = await readThemeOverrides(projectPath);
  for (const o of plan.outcomes) {
    if (o.outcome === "skip" || !o.token || o.value === undefined) continue;
    overrides = setTokenOverride(overrides, o.token, o.value, undefined, "preset");
  }
  if (preset.googleFont) overrides = addGoogleFont(overrides, preset.googleFont);
  await writeThemeOverridesFile(projectPath, overrides);

  const file = await readFileJson(projectPath);
  await writeFileJson(projectPath, { ...file, activeId: presetId });
  return plan;
}

/**
 * Select Default: put the project's SOURCE design system back by dropping only what presets wrote. The
 * user's own edits stay — including any they made to a token a preset had written, which became theirs the
 * moment they touched it.
 */
export async function selectDefaultPreset(projectPath: string): Promise<void> {
  await writeThemeOverridesFile(projectPath, clearPresetTokens(await readThemeOverrides(projectPath)));
  const file = await readFileJson(projectPath);
  await writeFileJson(projectPath, { ...file, activeId: null });
}

/** Capture the design system's current values as a new, project-owned preset. */
export async function createPresetFromCurrent(projectPath: string, name: string): Promise<Preset> {
  const tokens = await getInspectorTokens(projectPath).catch(() => null);
  const byName = new Map((tokens?.tokens ?? []).map((t) => [t.name.toLowerCase(), t.resolvedValue]));
  const { ROLE_CANDIDATES } = await import("@vortspec/core/presets");
  const values: Preset["values"] = {};
  for (const [role, candidates] of Object.entries(ROLE_CANDIDATES)) {
    const hit = candidates.map((c) => byName.get(c.toLowerCase())).find(Boolean);
    if (!hit) continue;
    const pair = parseLightDark(hit);
    values[role as keyof Preset["values"]] = pair ? { light: pair.light, dark: pair.dark } : { light: hit };
  }
  const preset: Preset = {
    id: `user-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: name.trim(),
    summary: "Captured from this project",
    builtIn: false,
    values,
  };
  const file = await readFileJson(projectPath);
  await writeFileJson(projectPath, {
    presets: [...file.presets.filter((p) => p.id !== preset.id), preset],
    activeId: file.activeId,
  });
  return preset;
}

/** Validate an imported preset before it is offered — a malformed file must not become a half-apply. */
export async function importPreset(projectPath: string, raw: unknown): Promise<Preset | null> {
  const parsed = presetSchema.safeParse(raw);
  if (!parsed.success) return null;
  const preset: Preset = { ...parsed.data, builtIn: false };
  const file = await readFileJson(projectPath);
  await writeFileJson(projectPath, {
    presets: [...file.presets.filter((p) => p.id !== preset.id), preset],
    activeId: file.activeId,
  });
  return preset;
}
