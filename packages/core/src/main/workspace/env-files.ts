import { existsSync, readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Environment-file helper (change: run-view-env-helper).
 *
 * A very common cloned-repo dead-end: the repo ships a `.env.example` but the
 * real `.env` is gitignored, so a fresh clone boots and then crashes at runtime
 * (e.g. "supabaseUrl is required"). This detects that state so the Run view can
 * offer a one-click "Create .env from example", and performs the copy safely —
 * confined to the project folder, only from a known example name, and never
 * overwriting an existing `.env`.
 */

/** Example env filenames we recognize, most-conventional first. */
export const ENV_EXAMPLE_NAMES = [
  ".env.example",
  ".env.template",
  ".env.sample",
  ".env.local.example",
  ".env.dist",
];

export interface EnvFileStatus {
  /** A real env file is present (`.env` or `.env.local`). */
  hasEnv: boolean;
  /** Example files found in the project root, in ENV_EXAMPLE_NAMES order. */
  examples: string[];
  /** Var NAMES in `.env` that are still blank or a `<placeholder>` (values never returned). */
  placeholders: string[];
}

/** Var names in `.env` whose value is blank or an unfilled `<placeholder>`. Never returns values. */
function placeholderVars(projectPath: string): string[] {
  const envPath = join(projectPath, ".env");
  if (!existsSync(envPath)) return [];
  try {
    const out: string[] = [];
    for (const raw of readFileSync(envPath, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "").trim();
      if (value === "" || /[<>]/.test(value)) out.push(m[1]);
    }
    return out;
  } catch {
    return [];
  }
}

export function getEnvStatus(projectPath: string): EnvFileStatus {
  const hasEnv = existsSync(join(projectPath, ".env")) || existsSync(join(projectPath, ".env.local"));
  const examples = ENV_EXAMPLE_NAMES.filter((n) => existsSync(join(projectPath, n)));
  return { hasEnv, examples, placeholders: placeholderVars(projectPath) };
}

/**
 * Copy a recognized example file to `.env`. Refuses unknown names (no path
 * traversal) and never clobbers an existing `.env` — the user fills in the
 * values afterward.
 */
export async function createEnvFromExample(
  projectPath: string,
  example: string,
): Promise<{ ok: boolean; message: string }> {
  if (!ENV_EXAMPLE_NAMES.includes(example)) {
    return { ok: false, message: "Unrecognized example file." };
  }
  const src = join(projectPath, example);
  const dest = join(projectPath, ".env");
  if (!existsSync(src)) return { ok: false, message: `${example} was not found.` };
  if (existsSync(dest)) return { ok: false, message: ".env already exists — leaving it untouched." };
  await copyFile(src, dest);
  return { ok: true, message: `Created .env from ${example}. Fill in the values, then restart the app.` };
}
