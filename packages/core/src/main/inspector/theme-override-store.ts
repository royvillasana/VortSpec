import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  parseThemeOverrides,
  setComponentOverride,
  setTokenOverride,
  type DeclBag,
  type ThemeOverrides,
} from "@vortspec/core/theme-overrides";

/**
 * Durable read/write of the project's design-system personalization overlay
 * (`.vortspec/theme-overrides.json`, change: consume-component-libraries). Best-effort read (empty
 * on missing/malformed); writes create `.vortspec/` as needed.
 */
const OVERRIDES_PATH = ".vortspec/theme-overrides.json";

export async function readThemeOverrides(projectPath: string): Promise<ThemeOverrides> {
  try {
    return parseThemeOverrides(JSON.parse(await readFile(join(projectPath, OVERRIDES_PATH), "utf8")));
  } catch {
    return parseThemeOverrides(null);
  }
}

async function writeThemeOverrides(projectPath: string, overrides: ThemeOverrides): Promise<void> {
  const p = join(projectPath, OVERRIDES_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(overrides, null, 2)}\n`);
}

export async function setThemeTokenOverride(
  projectPath: string,
  name: string,
  value: string,
  mode?: string,
): Promise<ThemeOverrides> {
  const next = setTokenOverride(await readThemeOverrides(projectPath), name, value, mode);
  await writeThemeOverrides(projectPath, next);
  return next;
}

export async function setThemeComponentOverride(
  projectPath: string,
  component: string,
  target: { variant?: string; option?: string; slot?: string },
  decls: DeclBag,
): Promise<ThemeOverrides> {
  const next = setComponentOverride(await readThemeOverrides(projectPath), component, target, decls);
  await writeThemeOverrides(projectPath, next);
  return next;
}
