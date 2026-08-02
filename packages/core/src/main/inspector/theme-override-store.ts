import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  addGoogleFont,
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

/** Persist the overlay. Exported so the preset store can write a batch in one go. */
export async function writeThemeOverridesFile(projectPath: string, overrides: ThemeOverrides): Promise<void> {
  return writeThemeOverrides(projectPath, overrides);
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

/**
 * Choose a font family for a token: write the STACK as the token's value and, for a Google family, record
 * it so its stylesheet is emitted wherever the design system renders. Picking without loading is the
 * failure this exists to prevent — the name changes, the type doesn't, and nothing says why.
 */
export async function setThemeFontFamily(
  projectPath: string,
  token: string,
  stack: string,
  google?: string,
): Promise<ThemeOverrides> {
  let next = setTokenOverride(await readThemeOverrides(projectPath), token, stack);
  if (google) next = addGoogleFont(next, google);
  await writeThemeOverrides(projectPath, next);
  return next;
}
