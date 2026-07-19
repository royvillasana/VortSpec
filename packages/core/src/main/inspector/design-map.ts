import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tokenKeyMapSchema, type TokenKeyMap } from "@vortspec/core/inspector";
import type { ResolveCandidate } from "./token-resolver";
import { normName } from "./figma-reconcile";

/**
 * The durable design-system join table (Plan B1). Persists the code-token → Figma
 * `variableKey` map at `.vortspec/maps/tokens.json`, so a confirmed match survives
 * renames and value collisions instead of being re-derived by fuzzy name/value
 * matching every session. This is the store; the resolver's key tier
 * (`token-resolver.ts`) consumes it via `stampTokenKeys`, and Figma sync/link-confirm
 * populate it via `recordTokenKey`.
 */

const TOKENS_MAP_PATH = ".vortspec/maps/tokens.json";

/** Read the durable token→variableKey map. Missing/malformed → an empty map. */
export async function readTokenKeyMap(projectPath: string): Promise<TokenKeyMap> {
  try {
    const raw = await readFile(join(projectPath, TOKENS_MAP_PATH), "utf8");
    const parsed = tokenKeyMapSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* no map yet */
  }
  return { tokens: {} };
}

/** Write the durable token→variableKey map (best-effort; creates `.vortspec/maps/`). */
export async function writeTokenKeyMap(projectPath: string, map: TokenKeyMap): Promise<void> {
  const path = join(projectPath, TOKENS_MAP_PATH);
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`, "utf8").catch(() => undefined);
}

/**
 * Record one code token ↔ Figma variableKey join (keyed by the code token's
 * normalized name so it survives later code renames). `value` is stored as the
 * drift baseline. Returns the updated map.
 */
export async function recordTokenKey(
  projectPath: string,
  codeToken: string,
  variableKey: string,
  value?: string,
): Promise<TokenKeyMap> {
  const map = await readTokenKeyMap(projectPath);
  if (variableKey) map.tokens[normName(codeToken)] = { variableKey, ...(value ? { value } : {}) };
  await writeTokenKeyMap(projectPath, map);
  return map;
}

/**
 * Merge confident code-token ↔ variableKey joins into the map, writing only when
 * something actually changed (so a read-path caller can populate the map without a
 * write on every open). Entries should come from HIGH-confidence matches only
 * (key/link/name signals) — never a fuzzy value guess. Returns whether it changed.
 */
export async function mergeTokenKeys(
  projectPath: string,
  entries: { token: string; variableKey: string; value?: string }[],
): Promise<{ changed: boolean }> {
  if (entries.length === 0) return { changed: false };
  const map = await readTokenKeyMap(projectPath);
  let changed = false;
  for (const e of entries) {
    if (!e.variableKey) continue;
    const norm = normName(e.token);
    const prev = map.tokens[norm];
    if (!prev || prev.variableKey !== e.variableKey || prev.value !== e.value) {
      map.tokens[norm] = { variableKey: e.variableKey, ...(e.value ? { value: e.value } : {}) };
      changed = true;
    }
  }
  if (changed) await writeTokenKeyMap(projectPath, map);
  return { changed };
}

/**
 * Stamp each code-token candidate with the `variableKey` recorded for it in the map,
 * so the resolver's durable-key tier can fire. Pure — the map is passed in. Candidates
 * without a recorded key are returned unchanged.
 */
export function stampTokenKeys(candidates: ResolveCandidate[], map: TokenKeyMap): ResolveCandidate[] {
  return candidates.map((c) => {
    const entry = map.tokens[normName(c.name)];
    return entry ? { ...c, key: entry.variableKey } : c;
  });
}

/**
 * Rows whose Figma value has drifted from the value recorded in the map (Plan B4
 * seed): the map's `value` baseline differs from the variable's current value. Pure.
 */
export function tokenDrift(
  map: TokenKeyMap,
  figmaByKey: Map<string, string>,
): { token: string; variableKey: string; was: string; now: string }[] {
  const out: { token: string; variableKey: string; was: string; now: string }[] = [];
  for (const [token, entry] of Object.entries(map.tokens)) {
    if (entry.value === undefined) continue;
    const now = figmaByKey.get(entry.variableKey);
    if (now !== undefined && now !== entry.value) {
      out.push({ token, variableKey: entry.variableKey, was: entry.value, now });
    }
  }
  return out;
}
