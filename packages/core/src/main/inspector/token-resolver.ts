import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tokenLinkMapSchema, type MatchSignal, type TokenLinkMap } from "@vortspec/core/inspector";
import { normName, normValue } from "./figma-reconcile";

/**
 * Layered token resolver (change: token-fidelity-sanitation). Maps a code token
 * or a Figma-variable binding to its counterpart across arbitrary naming, using
 * signals tried in precedence order: **link → name → value → alias**. Pure
 * computation (the link map is passed in); the file I/O for links lives in the
 * read/write helpers below. This is the single seam behind reconcile,
 * dedup-before-create, orphan detection, and component-token binding.
 */

/** A token or variable the resolver can match against or resolve. */
export interface ResolveCandidate {
  /** Name (code token or Figma slash path). */
  name: string;
  /** Resolved value in the active mode (hex / dimension / string). */
  value: string;
  /** The referenced token/variable name when this is an alias, else undefined. */
  aliasOf?: string;
  /**
   * The Figma variable's publish-stable **key** (Plan B1). On a Figma candidate
   * it's `variable.key`; on a code-token candidate it's the key recorded in the
   * durable map (`.vortspec/maps/tokens.json`). When both sides carry the same
   * key the match is unambiguous — it wins over name/value/alias.
   */
  key?: string;
}

export interface ResolveResult {
  /** The matched counterpart, or null when nothing resolved. */
  match: ResolveCandidate | null;
  /** Which layer produced the match (`none` when unresolved). */
  signal: MatchSignal;
  /** Candidates a value match found when it was ambiguous (>1) — for user confirmation. */
  suggestions?: ResolveCandidate[];
  /** True when a link exists but its target is missing (needs re-linking). */
  staleLink?: boolean;
}

/**
 * Resolve `candidate` against `index` (the Figma variables and/or code tokens to
 * match against). Precedence: a persisted link wins; then exact normalized name;
 * then a UNIQUE value match; then a shared alias target. A value match that hits
 * more than one candidate does not auto-resolve — it is returned as suggestions.
 */
export function resolveToken(
  candidate: ResolveCandidate,
  index: ResolveCandidate[],
  opts: { links?: TokenLinkMap } = {},
): ResolveResult {
  const key = normName(candidate.name);

  // 0. Durable key — the publish-stable Figma variableKey (Plan B1). When the code
  // token carries a mapped key and exactly one candidate shares it, that join is
  // authoritative: it survives renames and value collisions that fool later tiers.
  if (candidate.key) {
    const byKey = index.filter((c) => c.key && c.key === candidate.key);
    if (byKey.length === 1) return { match: byKey[0], signal: "key" };
  }

  // 1. Link — authoritative + durable. A dangling target is a stale link, not a match.
  const linkedTarget = opts.links?.[key];
  if (linkedTarget !== undefined) {
    const target = index.find((c) => normName(c.name) === normName(linkedTarget));
    if (target) return { match: target, signal: "link" };
    return { match: null, signal: "none", staleLink: true };
  }

  // 2. Name — normalized equality (handles formatting/case/separator differences).
  const byName = index.find((c) => normName(c.name) === key);
  if (byName) return { match: byName, signal: "name" };

  // 3. Value — mode-aware equality; auto-resolve only when unique, else suggest.
  if (candidate.value) {
    const v = normValue(candidate.value);
    const byValue = index.filter((c) => c.value && normValue(c.value) === v);
    if (byValue.length === 1) return { match: byValue[0], signal: "value" };
    if (byValue.length > 1) return { match: null, signal: "none", suggestions: byValue };
  }

  // 4. Alias — same alias-graph position (both point at the same primitive).
  if (candidate.aliasOf) {
    const a = normName(candidate.aliasOf);
    const byAlias = index.find((c) => c.aliasOf && normName(c.aliasOf) === a);
    if (byAlias) return { match: byAlias, signal: "alias" };
  }

  return { match: null, signal: "none" };
}

/** One component binding resolved to the CSS it should emit (token-fidelity-sanitation 7.1). */
export interface ComponentBindingResult {
  /** The Figma variable the component property is bound to (slash path). */
  figmaVar: string;
  /** The matched project token, WITHOUT the leading `--` (null on no match). */
  token: string | null;
  /** Which resolver layer produced the match (`none` when unresolved). */
  signal: MatchSignal;
  /** What the component should emit: `var(--token)` on a match, else null — NEVER a hardcoded value. */
  css: string | null;
  /** Value-ambiguous candidate token names (leading `--` stripped) to confirm, when signal is `none`. */
  suggestions?: string[];
  /** A link exists but its target is missing — needs re-linking, not a fresh bind. */
  staleLink?: boolean;
}

/**
 * Resolve a component's Figma variable bindings to project-token CSS references (task 7.1). Each binding
 * runs through {@link resolveToken} (link → name → value → alias); a match emits `var(--token)` so a
 * generated component NEVER hardcodes a hex/px or emits a raw Figma name. A `none` carries the signal
 * plus any ambiguous suggestions so the caller can dedup-create a token or flag an orphan (task 7.2)
 * instead of emitting a broken reference. Pure — the same seam the reconcile/dedup paths use.
 */
export function resolveComponentBindings(
  bindings: ResolveCandidate[],
  projectTokens: ResolveCandidate[],
  opts: { links?: TokenLinkMap } = {},
): ComponentBindingResult[] {
  return bindings.map((b) => {
    const r = resolveToken(b, projectTokens, opts);
    const token = r.match ? r.match.name.replace(/^--/, "") : null;
    return {
      figmaVar: b.name,
      token,
      signal: r.signal,
      css: token ? `var(--${token})` : null,
      ...(r.suggestions ? { suggestions: r.suggestions.map((s) => s.name.replace(/^--/, "")) } : {}),
      ...(r.staleLink ? { staleLink: true } : {}),
    };
  });
}

// ── Link store (`.vortspec/token-links.json`) — local-first, like token-overrides ──

const LINKS_PATH = ".vortspec/token-links.json";

/** Read the persisted code-token → Figma-variable links. Missing/malformed → {}. */
export async function readTokenLinks(projectPath: string): Promise<TokenLinkMap> {
  try {
    const raw = await readFile(join(projectPath, LINKS_PATH), "utf8");
    const parsed = tokenLinkMapSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* no links yet */
  }
  return {};
}

/**
 * Persist one confirmed link (code token → Figma variable path), keyed by the
 * code token's normalized name so it survives later renames on either side.
 */
export async function writeTokenLink(
  projectPath: string,
  codeToken: string,
  figmaPath: string,
): Promise<TokenLinkMap> {
  const links = await readTokenLinks(projectPath);
  links[normName(codeToken)] = figmaPath;
  const path = join(projectPath, LINKS_PATH);
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(links, null, 2)}\n`, "utf8").catch(() => undefined);
  return links;
}
