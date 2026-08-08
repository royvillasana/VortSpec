import { z } from "zod";
import { figmaVariableTypeSchema } from "./inspector";

/**
 * The canonical design-token artifact (`.vortspec/tokens.json`) — W3C Design Tokens (DTCG) form
 * (OpenSpec change: agentic-design-system, group 7). One scan of the design source produces this
 * file; every styling-specific token file is emitted FROM it, so switching styling never costs a
 * second read of the design source.
 *
 * The group tree survives as nesting, `$type`/`$value` sit on each leaf, and token-to-token
 * references are DTCG aliases. DTCG models all of that natively — but has no concept of modes,
 * collections, or a design source's durable published key. Rather than deviate from the format,
 * that structure rides in DTCG's own escape hatch, `$extensions`, under a single reverse-domain
 * namespace. The artifact therefore stays valid DTCG, and dropping the extension leaves a still
 * correct single-mode document whose values are the default mode's.
 *
 * The full payload contract, and the field-by-field split with the `figma-native-token-model`
 * change (it owns the SEMANTICS, this owns the ARTIFACT), is
 * `openspec/changes/agentic-design-system/extensions-contract.md`.
 *
 * This module is PURE — no fs, no process — so the whole shape is unit-testable. Zod appears only
 * at the parse boundary (`parseDesignTokenDocument`), matching `shared/inspector.ts`.
 */

/** Where the canonical artifact lives, relative to the project root. Spelled once. */
export const CANONICAL_TOKENS_PATH = ".vortspec/tokens.json";

/**
 * The `$extensions` namespace for every VortSpec token payload. Reverse-domain per DTCG, from this
 * project's own domain (`vortspec.com`); the `.tokens` suffix scopes it to the token pipeline so a
 * future `com.vortspec.<other>` extension needs no migration. Deliberately NOT `com.figma.*` — the
 * same payload is produced by the non-design-tool ingest paths (CSS custom properties, a theme
 * object, a consumed library's token file), which are not Figma.
 */
export const DTCG_EXTENSION_NS = "com.vortspec.tokens" as const;

// ── Values ───────────────────────────────────────────────────────────

/** A DTCG `$value`: a scalar, or a composite (shadow, typography, gradient…) built from them. */
export type DtcgValue = string | number | boolean | null | DtcgValue[] | { [key: string]: DtcgValue };
export const dtcgValueSchema: z.ZodType<DtcgValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(dtcgValueSchema),
    z.record(z.string(), dtcgValueSchema),
  ]),
);

/**
 * The DTCG-defined `$type` values, plus `boolean` and `string`.
 *
 * Those last two are the one place the artifact steps outside DTCG's type vocabulary, and it is
 * deliberate: Figma has BOOLEAN and STRING variables and DTCG defines no type for either, so the
 * alternatives are to drop those variables or to leave `$type` absent and smuggle the type into
 * `$extensions` — both lose information a round-trip needs. The exact source type is ALSO always
 * available as `figma.resolvedType`, so a strict DTCG consumer can ignore these two without loss.
 */
export const dtcgTypeSchema = z.enum([
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
  "boolean",
  "string",
]);
export type DtcgType = z.infer<typeof dtcgTypeSchema>;

/**
 * A `$type` as it may actually appear on disk: one of the known values above, or ANY other string.
 *
 * The vocabulary is open on purpose. The canonical artifact is written from a design source's own
 * DTCG export and task 7.2 persists that tree unmodified — and real exports carry `$type` values
 * outside the list (`fontSize`, `lineHeight`, `letterSpacing`, `boxShadow`; this repo's own
 * `mapDtcgType` in `main/figma/figma-cli.ts` already branches on all four). A closed enum would make
 * ONE unrecognised leaf fail the whole document parse, and `parseDesignTokenDocument` reports a
 * failed parse as "no canonical artifact yet" — so a single unfamiliar type would silently discard
 * every valid token in the file. Unknown types therefore round-trip verbatim and are mapped at read
 * time by the consumer that cares; `isKnownDtcgType` is how a consumer asks.
 */
export type DtcgTypeName = DtcgType | (string & {});
export const dtcgTypeNameSchema = dtcgTypeSchema.or(z.string());

/** Whether a `$type` is one this module names — i.e. safe to switch on exhaustively. */
export function isKnownDtcgType(type: string | undefined): type is DtcgType {
  return dtcgTypeSchema.safeParse(type).success;
}

// ── The `$extensions` payload ────────────────────────────────────────

/**
 * One mode's value. `value` is the concrete resolved value and is present whenever it is known —
 * INCLUDING when `alias` is set — so a consumer that cannot follow references still has something
 * to emit. `alias` is set only when this mode's value is a reference, and is always a DTCG alias
 * (`{primitive.color.primary}`), never the design source's own slash path.
 */
export const tokenModeValueSchema = z.object({
  value: dtcgValueSchema.optional(),
  alias: z.string().optional(),
});
export type TokenModeValue = z.infer<typeof tokenModeValueSchema>;

/** The design source's identity for a token — the fields that survive a rename. */
export const tokenSourceIdentitySchema = z.object({
  /** The publish-stable variable key: the durable join to a code token. */
  key: z.string().optional(),
  /** The source's own scalar type, when known. */
  resolvedType: figmaVariableTypeSchema.optional(),
  /**
   * The source's own variable name (`spacing/0.5`), recorded ONLY when sanitising it into DTCG name
   * segments changed it — see `dtcgSegmentFromSourceName`. Without it the join back to the design
   * source would not survive the rewrite, because the nesting no longer spells the original name.
   */
  sourceName: z.string().optional(),
});
export type TokenSourceIdentity = z.infer<typeof tokenSourceIdentitySchema>;

/**
 * The per-token payload. `modes` is keyed by mode NAME, not by Figma's mode id: ids are
 * Figma-internal, unstable across a file rebuild, and unreadable in a diff. Mode ORDER lives in the
 * document-level registry, which an object cannot carry.
 *
 * Absent `modes` means single-mode — the token is fully described by `$value`, and a reader asking
 * for "the value in mode X" falls back to `$value`. That is the legacy/flat-source path and must
 * never be an error.
 */
export const tokenExtensionPayloadSchema = z.object({
  collection: z.string().optional(),
  /** The mode whose value is mirrored in `$value`. Absent → single-mode. */
  defaultMode: z.string().optional(),
  modes: z.record(z.string(), tokenModeValueSchema).optional(),
  figma: tokenSourceIdentitySchema.optional(),
});
export type TokenExtensionPayload = z.infer<typeof tokenExtensionPayloadSchema>;

/**
 * A node's whole `$extensions` object. Other vendors' namespaces pass through untouched —
 * `$extensions` is shared ground, and silently dropping a foreign extension on a re-write would
 * corrupt someone else's artifact.
 */
export const tokenExtensionsSchema = z
  .object({ [DTCG_EXTENSION_NS]: tokenExtensionPayloadSchema.optional() })
  .catchall(z.unknown());
export type TokenExtensions = z.infer<typeof tokenExtensionsSchema>;

/** One collection of the design source: its modes, in source order, and which one is the default. */
export const tokenCollectionSchema = z.object({
  name: z.string(),
  /** Mode NAMES in the source's own order — human-diffable and stable across a re-export. */
  modes: z.array(z.string()).default([]),
  defaultMode: z.string().optional(),
});
export type TokenCollection = z.infer<typeof tokenCollectionSchema>;

/**
 * The document-level payload. The collection registry exists so a reader can enumerate collections
 * and modes WITHOUT walking every token — the mode switcher and the per-mode emitters both need
 * that list before they touch a single token.
 */
export const documentExtensionPayloadSchema = z.object({
  /** Which ingest path produced this artifact ("figma", "css", "library"…). Free-form so a new
   *  source needs no schema change. */
  source: z.string().optional(),
  /** ISO-8601 stamp of the read that produced it, for staleness reporting. */
  generatedAt: z.string().optional(),
  collections: z.array(tokenCollectionSchema).default([]),
});
export type DocumentExtensionPayload = z.infer<typeof documentExtensionPayloadSchema>;

export const documentExtensionsSchema = z
  .object({ [DTCG_EXTENSION_NS]: documentExtensionPayloadSchema.optional() })
  .catchall(z.unknown());
export type DocumentExtensions = z.infer<typeof documentExtensionsSchema>;

// ── The tree ─────────────────────────────────────────────────────────

/** A token: the leaf of the tree, identified by carrying a `$value`. */
export interface DesignTokenLeaf {
  $value: DtcgValue;
  $type?: DtcgTypeName;
  $description?: string;
  /** DTCG's own deprecation marker: `true`, or a string explaining what to use instead. */
  $deprecated?: boolean | string;
  $extensions?: TokenExtensions;
}

/** A group: any node that carries children instead of a `$value`. `$type` is inherited by them. */
export interface DesignTokenGroup {
  $type?: DtcgTypeName;
  $description?: string;
  $deprecated?: boolean | string;
  $extensions?: TokenExtensions;
  [child: string]: DesignTokenNode | DtcgTypeName | string | boolean | TokenExtensions | undefined;
}

export type DesignTokenNode = DesignTokenLeaf | DesignTokenGroup;

/**
 * The `$`-prefixed members each kind of node models. Everything else `$`-prefixed is preserved
 * VERBATIM rather than treated as a child. DTCG reserves the `$` prefix for format-level members and
 * keeps adding to the set — `$schema` is on the root of essentially every real `tokens.json`, and
 * `$deprecated` can sit on a group — so a schema that treats an unknown `$` key as a child would
 * fail the whole document on one unfamiliar member. That is the same failure `dtcgTypeNameSchema`
 * exists to avoid (a failed parse reads as "no canonical artifact yet", discarding every valid token
 * in the file), and it would be strictly stricter than the ingest this replaces — `dtcgToVariables`
 * skips `$`-prefixed keys outright. Stripping them instead is no better: task 7.2 persists the
 * source export unmodified, so anything dropped here would not survive the round-trip.
 *
 * These are all FLAT objects — no recursion — so parsing one is cheap and the cost of parsing a
 * document is linear in its node count (see `parseNodeObject`).
 */
const commonMetaShape = {
  $type: dtcgTypeNameSchema.optional(),
  $description: z.string().optional(),
  $deprecated: z.union([z.boolean(), z.string()]).optional(),
  $extensions: tokenExtensionsSchema.optional(),
};
const leafMetaSchema = z.object({ $value: dtcgValueSchema, ...commonMetaShape });
const groupMetaSchema = z.object(commonMetaShape);
const documentMetaSchema = z.object({
  $schema: z.string().optional(),
  $description: z.string().optional(),
  $extensions: documentExtensionsSchema.optional(),
});

/** Which role a node is being read in. `"node"` discriminates leaf vs group on `$value`. */
type NodeKind = "document" | "node" | "leaf" | "group";

/** A validation failure found while walking, in the same shape zod's `addIssue` wants. */
interface NodeIssue {
  path: (string | number)[];
  message: string;
}

const dollarKeys = (raw: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).filter(([key]) => key.startsWith("$")));

/**
 * Validate AND build a node in ONE pass, recursing by plain function call rather than by re-entering
 * zod per child.
 *
 * The one pass is the point. The previous shape validated in a `superRefine` and then rebuilt in a
 * chained `transform`, each of them running the recursive child schema over every child — so the
 * work doubled with every level of nesting (O(2^depth · N); a 2000-token document measured 2.4s at
 * depth 4 and 9.7s at depth 6). `primitive/color/brand/500` is already depth 4 and this is the only
 * parse boundary for `.vortspec/tokens.json`, so that cost was paid on every ingest and every
 * validation. Walking once, and discriminating leaf-vs-group on `$value` instead of trying a union's
 * leaf branch against every group, makes it linear.
 *
 * The returned object is a copy in the FILE's own key order — the artifact is read in diffs, and
 * reordering it on every parse would make a no-op re-write look like a change.
 */
function parseNodeObject(
  raw: unknown,
  kind: NodeKind,
  path: (string | number)[],
  issues: NodeIssue[],
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({ path, message: "expected a token or a group object" });
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  const hasValue = "$value" in obj;
  const isLeaf = kind === "leaf" || (kind === "node" && hasValue);
  // A group is defined by NOT carrying a `$value`. Saying so explicitly is what stops the
  // token-with-children shape from being re-admitted through the group branch, which is how it used
  // to slip past `designTokenLeafSchema`'s "a token may not carry children" rule.
  if (!isLeaf && hasValue)
    issues.push({ path: [...path, "$value"], message: "a group may not carry a $value" });

  const meta = kind === "document" ? documentMetaSchema : isLeaf ? leafMetaSchema : groupMetaSchema;
  const parsedMeta = meta.safeParse(dollarKeys(obj));
  if (!parsedMeta.success)
    for (const issue of parsedMeta.error.issues)
      issues.push({ path: [...path, ...issue.path], message: issue.message });
  const known: Record<string, unknown> = parsedMeta.success ? parsedMeta.data : {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("$")) {
      out[key] = key in known ? known[key] : value;
      continue;
    }
    if (isLeaf) {
      issues.push({ path: [...path, key], message: "a token may not carry children" });
      out[key] = value;
      continue;
    }
    out[key] = parseNodeObject(value, "node", [...path, key], issues);
  }
  return out;
}

/**
 * Wrap `parseNodeObject` as a zod schema. A single `transform` with a ctx — not
 * `superRefine().transform()` — so the tree is walked exactly once and the issues it found are the
 * ones zod reports.
 */
function nodeSchema<T>(kind: NodeKind): z.ZodType<T, z.ZodTypeDef, unknown> {
  return z.unknown().transform((raw, ctx) => {
    const issues: NodeIssue[] = [];
    const out = parseNodeObject(raw, kind, [], issues);
    for (const issue of issues)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
    return (issues.length ? z.NEVER : out) as T;
  }) as z.ZodType<T, z.ZodTypeDef, unknown>;
}

export const designTokenLeafSchema: z.ZodType<DesignTokenLeaf> = nodeSchema<DesignTokenLeaf>(
  "leaf",
) as z.ZodType<DesignTokenLeaf>;

export const designTokenGroupSchema: z.ZodType<DesignTokenGroup> = nodeSchema<DesignTokenGroup>(
  "group",
) as z.ZodType<DesignTokenGroup>;

/**
 * A node is a token exactly when it carries a `$value`, so the two are discriminated on that member
 * rather than by union. A union would let a token-with-children fall through to the group branch —
 * `$value` is just another `$`-member there — and DTCG's one structural rule would go unenforced.
 */
export const designTokenNodeSchema: z.ZodType<DesignTokenNode> = nodeSchema<DesignTokenNode>(
  "node",
) as z.ZodType<DesignTokenNode>;

/**
 * The canonical artifact: a group tree at the root, plus the document-level extension block. The
 * type is declared rather than inferred — `z.lazy` erases the catchall from inference, and the
 * children are the whole point of the document.
 */
export interface DesignTokenDocument {
  $description?: string;
  /** The JSON-Schema URL real exports put on the root; carried through, never acted on. */
  $schema?: string;
  $extensions?: DocumentExtensions;
  [group: string]: DesignTokenNode | string | DocumentExtensions | undefined;
}

// Input is `unknown`, not `DesignTokenDocument`: this is a parse boundary over a file on disk, and
// `collections` carries a `.default([])` so the accepted input is looser than the output.
export const designTokenDocumentSchema: z.ZodType<DesignTokenDocument, z.ZodTypeDef, unknown> =
  nodeSchema<DesignTokenDocument>("document");

/**
 * The one parse boundary for the canonical artifact. Returns null rather than throwing: a malformed
 * or hand-corrupted `tokens.json` must degrade to "no canonical artifact yet", never crash a read.
 */
export function parseDesignTokenDocument(data: unknown): DesignTokenDocument | null {
  const parsed = designTokenDocumentSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// ── Pure helpers over the tree ───────────────────────────────────────

/** A node is a token exactly when it carries a `$value`; everything else is a group. */
export function isTokenLeaf(node: DesignTokenNode | undefined): node is DesignTokenLeaf {
  return !!node && typeof node === "object" && "$value" in node;
}

/** The VortSpec payload on a node, or undefined. Never throws on a foreign-only `$extensions`. */
export function readTokenExtension(
  node: DesignTokenNode | undefined,
): TokenExtensionPayload | undefined {
  if (!node || typeof node !== "object") return undefined;
  const ext = (node as DesignTokenLeaf).$extensions;
  return ext ? (ext[DTCG_EXTENSION_NS] as TokenExtensionPayload | undefined) : undefined;
}

/** The document-level payload, or undefined. */
export function readDocumentExtension(
  doc: DesignTokenDocument | undefined,
): DocumentExtensionPayload | undefined {
  const ext = doc?.$extensions as DocumentExtensions | undefined;
  return ext ? (ext[DTCG_EXTENSION_NS] as DocumentExtensionPayload | undefined) : undefined;
}

/** `["primitive","color","primary"]` → `"{primitive.color.primary}"`. */
export function toDtcgAlias(path: readonly string[]): string {
  return `{${path.join(".")}}`;
}

/**
 * `"{primitive.color.primary}"` → `["primitive","color","primary"]`; null when the value is not an
 * alias. A whole-string match only — DTCG aliases replace a `$value`, they do not interpolate into
 * one, so `"1px solid {color.border}"` is a literal, not a reference.
 */
export function parseDtcgAlias(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const m = /^\{([^{}]+)\}$/.exec(value.trim());
  if (!m) return null;
  const path = m[1].split(".").filter((s) => s.length > 0);
  return path.length ? path : null;
}

/**
 * Characters DTCG forbids inside a token NAME: `.` is the path separator and `{`/`}` delimit an
 * alias, so a name containing any of them cannot be addressed. Figma imposes no such rule and real
 * files are full of `spacing/0.5`, `radius/1.5`, `gray.100`.
 */
const DTCG_RESERVED_IN_NAME = /[.{}]/g;

/**
 * One segment of a design source's name → one DTCG name segment.
 *
 * Sanitising rather than rejecting: a dotted variable name is ordinary in Figma, and refusing to
 * represent it would drop real tokens. Left alone it is worse than dropped — `spacing/0.5` would
 * become the alias `{spacing.0.5}`, which resolves to the three-segment path
 * `["spacing","0","5"]` and dangles silently. The original name is recoverable from
 * `$extensions[NS].figma.sourceName`, which ingest records whenever this function changed the
 * segment, so the join back to the design source survives.
 *
 * A LEADING `$` is sanitised for the same reason and is the more dangerous of the two: DTCG reserves
 * the `$` prefix for format members, so a Figma variable named `$extensions/foo` would be written as
 * a group the format reads as metadata — every reader here skips `$` keys — and ingest would then
 * overwrite it with the real `$extensions` block. The token would vanish with nothing reporting it.
 * Only the prefix is reserved, so a `$` anywhere else in the segment is left alone.
 */
export function dtcgSegmentFromSourceName(segment: string): string {
  const sanitised = segment.replace(DTCG_RESERVED_IN_NAME, "-");
  return sanitised.startsWith("$") ? `-${sanitised.slice(1)}` : sanitised;
}

/**
 * A design source's slash path (`primitive/color/primary`) → the DTCG name path, sanitised segment
 * by segment. Empty segments are dropped so leading and duplicated separators cannot produce one.
 */
export function figmaNameToDtcgPath(name: string): string[] {
  return name
    .split("/")
    .filter((s) => s.length > 0)
    .map(dtcgSegmentFromSourceName);
}

/**
 * A design source's slash path (`primitive/color/primary`) → a DTCG alias. The translation is owned
 * by THIS change: `figma-native-token-model` records a reference as the target's slash-path name,
 * and the canonical artifact expresses the same fact in the format's own syntax.
 */
export function figmaNameToDtcgAlias(name: string): string {
  return toDtcgAlias(figmaNameToDtcgPath(name));
}

/**
 * The value of a token in one mode. Falls back to `$value` when the token carries no modes map —
 * a single-mode token IS its `$value` in every mode, and treating that as "missing" would report a
 * flat source as broken. Returns the alias when the mode's value is a reference, mirroring the
 * `$value`-mirrors-default-mode rule.
 *
 * An EMPTY modes map counts as absent, per the contract's "absent ≠ empty" rule: `{}` is a bug in
 * whatever wrote it (a projection that initialises the record before filling it), and reading it as
 * "this token has no value in any mode" would turn that bug into a token that reports as valueless
 * even though its `$value` is right there.
 */
export function tokenValueForMode(leaf: DesignTokenLeaf, mode: string): DtcgValue | undefined {
  const modes = readTokenExtension(leaf)?.modes;
  const hasModes = !!modes && Object.keys(modes).length > 0;
  const entry = hasModes ? modes[mode] : undefined;
  if (!entry) return hasModes ? undefined : leaf.$value;
  return entry.alias ?? entry.value;
}
