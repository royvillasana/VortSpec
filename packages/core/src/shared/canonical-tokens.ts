import {
  DTCG_EXTENSION_NS,
  figmaNameToDtcgAlias,
  figmaNameToDtcgPath,
  parseDesignTokenDocument,
  parseDtcgAlias,
  readDocumentExtension,
  readTokenExtension,
  type DesignTokenDocument,
  type DesignTokenLeaf,
  type DtcgTypeName,
  type DtcgValue,
  type TokenCollection,
  type TokenModeValue,
} from "./design-tokens";
import type { FigmaVariable, FigmaVariableModel, TokenType } from "./inspector";

/**
 * Ingest into, projection out of, and validation of the canonical token artifact
 * (`.vortspec/tokens.json`) — OpenSpec change: agentic-design-system, tasks 7.2–7.4.
 *
 * The pipeline this module implements is deliberately one-directional:
 *
 *   design source ──build──▶ canonical DTCG document ──project──▶ everything downstream
 *
 * Before this change the arrow went straight from the design source to a FLAT row list
 * (`dtcgToVariables`), so the group tree, the aliases and the modes were destroyed at ingest and
 * every later question — "emit for Tailwind", "which mode is this" — had to go back to Figma for
 * data we had already read. Flattening is now a READ concern: `projectCanonicalToVariables` derives
 * the flat rows on demand and the tree stays on disk. The `$extensions` payload it reads and writes
 * is fixed by `openspec/changes/agentic-design-system/extensions-contract.md`.
 *
 * PURE — no fs, no process — so ingest, projection and validation are all unit-testable against
 * in-memory fixtures. The fs half lives in `main/inspector/canonical-tokens.ts`.
 */

// ── Type mapping, both directions ────────────────────────────────────

/**
 * Map a W3C DTCG `$type` (+ a name hint) to VortSpec's token type. Pure.
 *
 * Lives here rather than in `main/figma/figma-cli.ts` (which re-exports it) because the projection
 * needs it and the projection must stay fs-free.
 */
export function mapDtcgType($type: string | undefined, name: string): TokenType {
  const t = ($type ?? "").toLowerCase();
  if (t === "color" || t === "gradient") return "color";
  if (t === "shadow" || t === "boxshadow") return "shadow";
  if (
    t === "typography" ||
    t === "fontfamily" ||
    t === "fontweight" ||
    t === "fontsize" ||
    t === "lineheight" ||
    t === "letterspacing"
  )
    return "typography";
  if (/radius|corner|rounded/i.test(name)) return "radius";
  if (t === "dimension" || t === "number" || t === "duration") return "spacing";
  return "other";
}

/**
 * The `$type` to write for a design-source variable — from its own scalar type first, falling back
 * to VortSpec's coarse `TokenType` when the source gave none.
 *
 * Best-effort by nature: Figma's four scalar types carry less information than DTCG's vocabulary,
 * so FLOAT alone cannot tell a duration from a spacing step and the variable's NAME is the only
 * remaining signal. The two name heuristics below are the ones that change the emitted unit
 * (`duration` is `ms`, `fontWeight` is unitless), which is why they earn their keep; everything
 * else FLOAT-shaped is a `dimension`. The exact source type is never lost regardless — it is
 * recorded verbatim as `figma.resolvedType` — so a wrong guess here degrades presentation, not the
 * round-trip.
 */
export function dtcgTypeForVariable(variable: FigmaVariable): DtcgTypeName | undefined {
  const name = variable.name;
  switch (variable.resolvedType) {
    case "COLOR":
      return "color";
    case "BOOLEAN":
      return "boolean";
    case "STRING":
      return "string";
    case "FLOAT":
      if (/duration|transition|delay|animation/i.test(name)) return "duration";
      if (/font-?weight/i.test(name)) return "fontWeight";
      return "dimension";
    default:
      break;
  }
  switch (variable.type) {
    case "color":
      return "color";
    case "shadow":
      return "shadow";
    case "typography":
      return "fontFamily";
    case "spacing":
    case "radius":
      return "dimension";
    default:
      return undefined;
  }
}

/** Stringify a DTCG `$value` to a concrete display value (composites → JSON). */
export function stringifyTokenValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * A DTCG alias (`{primitive.color.primary}`) → the design source's slash path
 * (`primitive/color/primary`), which is how `FigmaVariable.valuesByMode[*].aliasOf` records a
 * reference. The inverse of `figmaNameToDtcgAlias`, and lossy in the same one way the contract
 * names: a source segment that had to be sanitised (`spacing/0.5` → `spacing-0-5`) comes back
 * sanitised, because only the ALIASED token knows its own original name. Consumers use `aliasOf`
 * to group tokens that point at the same target, and a consistently-sanitised path groups them
 * exactly as well as the original would.
 */
export function dtcgAliasToSourceName(alias: string): string | undefined {
  const path = parseDtcgAlias(alias);
  return path ? path.join("/") : undefined;
}

// ── Projection: canonical artifact → flat variable rows (task 7.3) ───

/**
 * Flatten the canonical artifact into the flat `FigmaVariable` rows every current consumer
 * (`figma-reconcile`, `token-resolver`, the Inspector) already speaks — the READ-TIME half of the
 * pipeline.
 *
 * A node is a token when it carries a `$value`; its name is the slash-joined path, or the recorded
 * `figma.sourceName` when sanitising changed that path. `$type` is inherited from the nearest
 * ancestor that declares one. Where the `$extensions` payload is present the row is enriched with
 * the collection, the durable key, the source's scalar type and the per-mode values; where it is
 * absent — a plain DTCG export, or the pre-`$extensions` artifacts already on disk — the row is
 * exactly what `dtcgToVariables` produced before, which is what keeps this a refactor.
 *
 * Deliberately walks the RAW tree instead of `parseDesignTokenDocument` first: this is the ingest
 * path for a design source's own export, and rejecting a whole file over one leaf the schema does
 * not recognise would lose every valid token in it. Validation is a separate, explicit step
 * (`validateCanonicalTokens`).
 */
export function projectCanonicalToVariables(doc: unknown): FigmaVariable[] {
  const out: FigmaVariable[] = [];
  const walk = (node: unknown, path: string[], inheritedType: string | undefined): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    const declaredType = typeof obj.$type === "string" ? obj.$type : inheritedType;
    if ("$value" in obj) {
      const row = projectLeaf(obj as unknown as DesignTokenLeaf, path, declaredType);
      if (row) out.push(row);
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith("$")) continue; // $description, $extensions, etc.
      walk(child, [...path, key], declaredType);
    }
  };
  walk(doc, [], undefined);
  return out;
}

function projectLeaf(
  leaf: DesignTokenLeaf,
  path: string[],
  declaredType: string | undefined,
): FigmaVariable | null {
  const dtcgName = path.join("/");
  if (!dtcgName) return null;
  const ext = readTokenExtension(leaf);
  const name = ext?.figma?.sourceName || dtcgName;

  const modeEntries = Object.entries(ext?.modes ?? {});
  const valuesByMode = modeEntries.length
    ? Object.fromEntries(
        modeEntries.map(([mode, entry]) => [
          mode,
          {
            value: entry.value === undefined ? undefined : stringifyTokenValue(entry.value),
            aliasOf: entry.alias ? dtcgAliasToSourceName(entry.alias) : undefined,
          },
        ]),
      )
    : undefined;

  // The default mode's CONCRETE value, not `$value`: for an aliased token `$value` is the alias
  // string, while `resolvedValue` is contractually the value a consumer can emit.
  const defaultEntry = ext?.defaultMode ? ext.modes?.[ext.defaultMode] : undefined;
  const resolvedValue =
    defaultEntry?.value !== undefined
      ? stringifyTokenValue(defaultEntry.value)
      : stringifyTokenValue(leaf.$value);

  return {
    name,
    resolvedValue,
    type: mapDtcgType(declaredType, name),
    collection: ext?.collection,
    resolvedType: ext?.figma?.resolvedType,
    key: ext?.figma?.key,
    valuesByMode,
  };
}

/**
 * Project the canonical artifact into the FULL mode/group/alias-aware model — what
 * `.vortspec/figma-variables.json` used to hold, derived rather than stored (task 7.13).
 *
 * This is the second half of retiring that cache. `projectCanonicalToVariables` already produces the
 * variable rows; the missing piece was the COLLECTION REGISTRY, which is what the Tokens panel's
 * mode switcher, `pickActiveCollection` and `deriveModeMap` all read. It lives in the document-level
 * `$extensions`, so the whole model is recoverable and the cache has nothing left that the artifact
 * does not carry.
 *
 * Mode IDS are set to the mode NAME. The artifact deliberately does not keep Figma's internal mode
 * ids — the `$extensions` contract keys modes by name because ids are unstable across a file rebuild
 * and unreadable in a diff. Every consumer here compares an id only against `defaultModeId` from the
 * same collection, so a name-as-id is self-consistent; nothing joins these ids back to Figma.
 */
export function projectCanonicalToVariableModel(doc: unknown): FigmaVariableModel {
  const variables = projectCanonicalToVariables(doc);
  const ext = readDocumentExtension(doc as DesignTokenDocument | undefined);
  const collections = (ext?.collections ?? []).map((collection) => ({
    name: collection.name,
    modes: collection.modes.map((mode) => ({ id: mode, name: mode })),
    ...(collection.defaultMode ? { defaultModeId: collection.defaultMode } : {}),
  }));
  return { collections, variables };
}

// ── Ingest: design source → canonical artifact (task 7.2) ────────────

/** Provenance stamped onto the document-level `$extensions` block by either ingest path. */
export interface CanonicalBuildMeta {
  /** Which ingest path produced this artifact ("figma", "css", "library"…). */
  source?: string;
  /** ISO-8601 stamp of the read. Supplied by the caller so the build stays pure and testable. */
  generatedAt?: string;
}

/**
 * The outcome of building the canonical artifact from a design source.
 *
 * `dropped` names the variables that could NOT be represented as DTCG nesting — see
 * `insertLeaf`. It is returned rather than swallowed because a token that vanishes between Figma
 * and the artifact is exactly the kind of silent loss this change exists to remove; the caller
 * surfaces it.
 */
export interface CanonicalBuildResult {
  document: DesignTokenDocument;
  dropped: string[];
}

/**
 * Build the canonical artifact from the mode/group/alias-aware variable model — the PRIMARY ingest
 * path, since that model is the only read that carries modes and durable keys at all.
 *
 * The group tree is the variable's slash path; per-mode values, the collection and the durable key
 * ride in `$extensions`; and `$value` mirrors the default mode so a mode-blind DTCG tool reads the
 * file correctly and simply sees the default mode.
 */
export function canonicalFromVariableModel(
  model: FigmaVariableModel,
  meta: CanonicalBuildMeta = {},
): CanonicalBuildResult {
  const collections: TokenCollection[] = model.collections.map((collection) => {
    const modes = collection.modes.map((mode) => mode.name);
    const defaultMode =
      collection.modes.find((mode) => mode.id === collection.defaultModeId)?.name ?? modes[0];
    return { name: collection.name, modes, defaultMode };
  });
  const defaultModeOf = new Map(collections.map((c) => [c.name, c.defaultMode]));

  const root: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const variable of model.variables) {
    const path = figmaNameToDtcgPath(variable.name);
    const leaf = buildLeaf(variable, path, defaultModeOf.get(variable.collection ?? ""));
    if (!leaf || !insertLeaf(root, path, leaf)) dropped.push(variable.name);
  }

  const document = root as DesignTokenDocument;
  document.$extensions = {
    [DTCG_EXTENSION_NS]: {
      ...(meta.source ? { source: meta.source } : {}),
      ...(meta.generatedAt ? { generatedAt: meta.generatedAt } : {}),
      collections,
    },
  };
  return { document, dropped };
}

/**
 * Adopt a design source's own DTCG export as the canonical artifact — the FALLBACK ingest path,
 * used when the richer variable read is unavailable.
 *
 * The tree is persisted UNMODIFIED: nesting, aliases, `$description`s and any `$`-member the format
 * grows are all carried through untouched (task 7.2). The only addition is the document-level
 * provenance block, which is what makes the file self-describing about where it came from; an
 * export carries no collection registry, so `collections` is empty and every token reads as
 * single-mode — correct, just mode-blind, exactly as the export itself is.
 *
 * Deliberately does NOT gate the ingest on a whole-document parse, for the same reason
 * `projectCanonicalToVariables` walks the raw tree: real exports carry branches that are not tokens
 * at all (a root-level `"version": "1.0"`, a `meta` block), and failing the document over one of
 * them would discard every valid token in the file and leave the previous cache in place — a silent,
 * total data loss dressed up as "couldn't parse". The tree is stamped and written; structural
 * problems are reported separately and explicitly by `validateCanonicalTokens`.
 *
 * Returns null only when the data is not an object at all — the one case where there is no tree to
 * persist and a caller genuinely has nothing to write.
 */
export function canonicalFromDtcgExport(
  data: unknown,
  meta: CanonicalBuildMeta = {},
): DesignTokenDocument | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  const priorExt = raw.$extensions;
  const existing =
    priorExt && typeof priorExt === "object" && !Array.isArray(priorExt)
      ? (priorExt as Record<string, unknown>)
      : {};
  const prior = existing[DTCG_EXTENSION_NS] as { collections?: TokenCollection[] } | undefined;
  return {
    // Spread first so the export's own key order — which is what a diff of the artifact reads —
    // survives, including the position of an `$extensions` block that was already there.
    ...raw,
    $extensions: {
      // Foreign namespaces pass through: `$extensions` is shared ground and dropping another
      // vendor's block on a re-write would corrupt their artifact.
      ...existing,
      [DTCG_EXTENSION_NS]: {
        ...(meta.source ? { source: meta.source } : {}),
        ...(meta.generatedAt ? { generatedAt: meta.generatedAt } : {}),
        collections: Array.isArray(prior?.collections) ? prior.collections : [],
      },
    },
  } as DesignTokenDocument;
}

function buildLeaf(
  variable: FigmaVariable,
  path: string[],
  collectionDefaultMode: string | undefined,
): DesignTokenLeaf | null {
  if (!path.length) return null;

  const sourceModes = Object.entries(variable.valuesByMode ?? {});
  const modes: Record<string, TokenModeValue> = {};
  for (const [mode, entry] of sourceModes) {
    modes[mode] = {
      ...(entry.value === undefined ? {} : { value: entry.value }),
      ...(entry.aliasOf ? { alias: figmaNameToDtcgAlias(entry.aliasOf) } : {}),
    };
  }
  const defaultMode =
    collectionDefaultMode && modes[collectionDefaultMode]
      ? collectionDefaultMode
      : sourceModes.length === 1
        ? sourceModes[0][0]
        : undefined;

  // A genuinely single-mode literal is fully described by `$value`, so the modes map is omitted
  // (contract rule 3) — carrying a one-entry map would only duplicate `$value` in the artifact.
  // A single mode that ALIASES still needs the map, because `$value` alone cannot say both what the
  // reference is and what it resolves to.
  const hasAlias = Object.values(modes).some((m) => m.alias);
  const keepModes = sourceModes.length > 1 || hasAlias;

  const defaultEntry = defaultMode ? modes[defaultMode] : undefined;
  const $value: DtcgValue =
    defaultEntry?.alias ?? (defaultEntry?.value as DtcgValue | undefined) ?? variable.resolvedValue;

  const sourceName = path.join("/") === normalizeSourcePath(variable.name) ? undefined : variable.name;
  const figma = {
    ...(variable.key ? { key: variable.key } : {}),
    ...(variable.resolvedType ? { resolvedType: variable.resolvedType } : {}),
    ...(sourceName ? { sourceName } : {}),
  };
  const payload = {
    ...(variable.collection ? { collection: variable.collection } : {}),
    ...(keepModes && defaultMode ? { defaultMode } : {}),
    ...(keepModes ? { modes } : {}),
    ...(Object.keys(figma).length ? { figma } : {}),
  };

  const $type = dtcgTypeForVariable(variable);
  return {
    ...($type ? { $type } : {}),
    $value,
    ...(Object.keys(payload).length ? { $extensions: { [DTCG_EXTENSION_NS]: payload } } : {}),
  };
}

/** The source name with empty segments dropped — what a round-trip through the path can reproduce. */
function normalizeSourcePath(name: string): string {
  return name
    .split("/")
    .filter((s) => s.length > 0)
    .join("/");
}

/**
 * Place a token at its path, creating the groups above it. Returns false when the path collides
 * with a token already placed — either the slot is taken, or an ancestor is itself a token.
 *
 * Both collisions are unrepresentable rather than merely awkward: DTCG identifies a token by
 * carrying `$value`, so `color/primary` and `color/primary/500` cannot both exist, and the honest
 * answer is to report the loser rather than overwrite the winner or invent a name for it.
 *
 * A `$`-prefixed segment is refused for the same reason: the prefix is reserved for format members,
 * so such a node is metadata to every DTCG reader and the token would disappear. `figmaNameToDtcgPath`
 * already sanitises the prefix away, so this is the local guarantee that no OTHER caller can
 * reintroduce the silent loss — a refusal here lands the variable in `dropped`, where it is reported.
 */
export function insertLeaf(root: Record<string, unknown>, path: string[], leaf: DesignTokenLeaf): boolean {
  if (path.some((segment) => segment.startsWith("$"))) return false;
  let cursor = root;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (next === undefined) {
      const group: Record<string, unknown> = {};
      cursor[segment] = group;
      cursor = group;
      continue;
    }
    if (!next || typeof next !== "object" || Array.isArray(next) || "$value" in next) return false;
    cursor = next as Record<string, unknown>;
  }
  const key = path[path.length - 1];
  if (cursor[key] !== undefined) return false;
  cursor[key] = leaf;
  return true;
}

// ── Validation (task 7.4) ────────────────────────────────────────────

export type CanonicalTokenViolationCode =
  /** The document is not valid DTCG at all — it failed the format's parse boundary. */
  | "invalid-dtcg"
  /** A design-source-specific field appears outside `$extensions`. */
  | "source-field-outside-extensions"
  /** A token or group name contains a character DTCG reserves (`.`, `{`, `}`). */
  | "reserved-character-in-name"
  /** A node carries both a `$value` and children — DTCG's one structural rule. */
  | "token-has-children"
  /** An alias points at a path no token occupies. */
  | "dangling-alias"
  /** `$value` does not mirror the default mode's value. */
  | "value-mode-mismatch";

export interface CanonicalTokenViolation {
  code: CanonicalTokenViolationCode;
  /** Dot-joined path to the offending node, `""` for the document root. */
  path: string;
  message: string;
}

export interface CanonicalTokenValidation {
  valid: boolean;
  /** The parsed document when it is valid DTCG, else null. */
  document: DesignTokenDocument | null;
  violations: CanonicalTokenViolation[];
}

/**
 * The design source's own vocabulary. Every one of these is legitimate INSIDE the VortSpec
 * `$extensions` payload and illegitimate anywhere else — that is the whole point of putting the
 * structure DTCG does not model behind the format's escape hatch instead of bolting it onto the
 * nodes. A field from this list sitting on a node is the exact failure the spec's "no
 * design-source-specific field SHALL appear outside `$extensions`" clause forbids.
 */
const SOURCE_SPECIFIC_FIELDS = new Set([
  "collection",
  "collections",
  "modes",
  "valuesByMode",
  "resolvedType",
  "resolvedValue",
  "aliasOf",
  "defaultMode",
  "defaultModeId",
  "sourceName",
  "variableKey",
  "figma",
  "key",
]);

/**
 * Check that the artifact is valid DTCG and that the design source's structure stayed inside
 * `$extensions` (task 7.4).
 *
 * Never throws and never mutates: it reports. The two checks are run independently and both are
 * reported, because "it failed to parse" is a far less useful answer than "you put `valuesByMode`
 * on the token" when the second is what caused the first.
 */
export function validateCanonicalTokens(data: unknown): CanonicalTokenValidation {
  const violations: CanonicalTokenViolation[] = [];
  scanForSourceFields(data, [], violations);
  scanForTokenChildren(data, [], violations);

  const document = parseDesignTokenDocument(data);
  if (!document) {
    violations.push({
      code: "invalid-dtcg",
      path: "",
      message: "the artifact is not a valid W3C DTCG token document",
    });
    return { valid: false, document: null, violations };
  }

  const leaves = new Map<string, DesignTokenLeaf>();
  collectLeaves(document, [], leaves, violations);
  for (const [path, leaf] of leaves) checkLeaf(path, leaf, leaves, violations);

  return { valid: violations.length === 0, document, violations };
}

/**
 * Walk the RAW data for design-source fields living outside `$extensions`.
 *
 * Raw rather than parsed because the offending shapes usually fail the parse too — a token carrying
 * `figma: { key: "…" }` is a token with a child, which DTCG forbids — and the specific finding is
 * only recoverable before the parse collapses it into "invalid document".
 *
 * A non-`$` key is flagged when it sits on a TOKEN (DTCG forbids a token from having children, so
 * nothing there can be a legitimate group) or when its value is not an object (a scalar can never
 * be a DTCG node). Elsewhere it is left alone: a GROUP legitimately named `modes` or `key` is a
 * token path a designer may really have created, and reporting it would make the validator lie
 * about a valid artifact.
 */
function scanForSourceFields(
  node: unknown,
  path: string[],
  violations: CanonicalTokenViolation[],
): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const entries = Object.entries(node as Record<string, unknown>);
  const onToken = entries.some(([key]) => key === "$value");
  for (const [key, value] of entries) {
    if (key === "$extensions") continue; // where this structure belongs
    const here = [...path, key].join(".");
    const bare = key.startsWith("$") ? key.slice(1) : key;
    const smuggled =
      SOURCE_SPECIFIC_FIELDS.has(bare) &&
      (key.startsWith("$") || onToken || typeof value !== "object" || value === null);
    if (smuggled) {
      violations.push({
        code: "source-field-outside-extensions",
        path: here,
        message: `"${key}" is design-source structure and belongs under $extensions["${DTCG_EXTENSION_NS}"]`,
      });
      continue;
    }
    if (key.startsWith("$")) continue;
    scanForSourceFields(value, [...path, key], violations);
  }
}

/**
 * Walk the RAW data for nodes that carry both a `$value` and children.
 *
 * This is DTCG's one structural rule — a token is identified by its `$value` and cannot also be a
 * group — and it is the rule most likely to be broken by a hand edit or by a generator that appends
 * a scale under an existing token. The nested token is not merely invalid, it is INVISIBLE: every
 * reader here (`collectLeaves`, `projectCanonicalToVariables`) stops at the `$value` and never sees
 * it, so without this check a token disappears with the artifact still reporting as fine.
 *
 * Raw rather than parsed, for the same reason `scanForSourceFields` is: the shape fails the parse,
 * and "the artifact is not valid DTCG" is a far less useful answer than the path of the child that
 * made it so.
 */
function scanForTokenChildren(
  node: unknown,
  path: string[],
  violations: CanonicalTokenViolation[],
): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const obj = node as Record<string, unknown>;
  // The document ROOT legitimately has children; only a named node can be a token.
  const onToken = "$value" in obj && path.length > 0;
  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    const here = [...path, key];
    if (onToken)
      violations.push({
        code: "token-has-children",
        path: here.join("."),
        message: `"${here.join(".")}" is nested inside the token "${path.join(
          ".",
        )}" — a DTCG token carries a $value and may not carry children`,
      });
    scanForTokenChildren(child, here, violations);
  }
}

/** Index every token by its dot path, flagging names DTCG cannot address on the way down. */
function collectLeaves(
  node: unknown,
  path: string[],
  out: Map<string, DesignTokenLeaf>,
  violations: CanonicalTokenViolation[],
): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const obj = node as Record<string, unknown>;
  if ("$value" in obj && path.length) {
    out.set(path.join("."), obj as unknown as DesignTokenLeaf);
    return;
  }
  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    if (/[.{}]/.test(key))
      violations.push({
        code: "reserved-character-in-name",
        path: [...path, key].join("."),
        message: `"${key}" contains a character DTCG reserves for paths and aliases (. { })`,
      });
    collectLeaves(child, [...path, key], out, violations);
  }
}

function checkLeaf(
  path: string,
  leaf: DesignTokenLeaf,
  leaves: Map<string, DesignTokenLeaf>,
  violations: CanonicalTokenViolation[],
): void {
  const ext = readTokenExtension(leaf);
  const aliases = [leaf.$value, ...Object.values(ext?.modes ?? {}).map((m) => m.alias)];
  for (const candidate of aliases) {
    const target = parseDtcgAlias(candidate);
    if (target && !leaves.has(target.join(".")))
      violations.push({
        code: "dangling-alias",
        path,
        message: `alias {${target.join(".")}} points at no token`,
      });
  }

  // Contract rule 1: `$value` mirrors the default mode, which is what lets a mode-blind DTCG tool
  // read the artifact correctly. A mismatch means the two disagree about the same fact.
  const modes = ext?.modes;
  const defaultMode = ext?.defaultMode;
  if (!modes || !Object.keys(modes).length || !defaultMode) return;
  const entry = modes[defaultMode];
  if (!entry) return;
  const expected = entry.alias ?? entry.value;
  if (expected === undefined) return;
  if (stringifyTokenValue(expected) !== stringifyTokenValue(leaf.$value))
    violations.push({
      code: "value-mode-mismatch",
      path,
      message: `$value does not mirror the default mode "${defaultMode}"`,
    });
}
