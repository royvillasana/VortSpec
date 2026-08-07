import { z } from "zod";
import { figmaComponentSchema } from "./figma";

/**
 * Design System Inspector contracts (change: add-design-system-inspector).
 * Tokens are derived from the project's own files — the configured token file
 * (and, later, the authoritative Figma variables) — not from any IR store.
 * Zod validation lives only at this parse boundary.
 */

export const tokenTypeSchema = z.enum([
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "other",
]);
export type TokenType = z.infer<typeof tokenTypeSchema>;

/** Where a token's value came from — the v2 file-derived replacement for v1 IR provenance. */
export const tokenSourceSchema = z.enum([
  "figma-variable",
  "generated-code",
  "hand-edited",
]);
export type TokenSource = z.infer<typeof tokenSourceSchema>;

/** Whether a code token is in sync with its authoritative Figma variable. */
export const tokenDriftSchema = z.enum(["in-sync", "drifted"]);
export type TokenDrift = z.infer<typeof tokenDriftSchema>;

/**
 * Which resolver layer matched a token to its Figma variable (change:
 * token-fidelity-sanitation): a persisted link, normalized name, resolved value,
 * or shared alias target — `none` when unresolved.
 */
export const matchSignalSchema = z.enum(["key", "link", "name", "value", "alias", "none"]);
export type MatchSignal = z.infer<typeof matchSignalSchema>;

export const inspectorTokenSchema = z.object({
  /** CSS custom-property name without the leading `--` (e.g. `color-primary`). */
  name: z.string(),
  type: tokenTypeSchema,
  /** Raw value as written in the token file (may be a `var(--other)` reference). */
  rawValue: z.string(),
  /** Value with in-file `var(--x)` references resolved, for display/swatches. */
  resolvedValue: z.string(),
  source: tokenSourceSchema,
  /** How many component source references this token (best-effort var() scan). */
  uses: z.number(),
  /** The matched Figma variable's resolved value, when a Figma export is present. */
  figmaValue: z.string().optional(),
  /** In-sync/drifted vs the matched Figma variable; absent when unmatched/no export. */
  drift: tokenDriftSchema.optional(),
  /** Which resolver layer matched this token to its Figma variable (change: token-fidelity-sanitation). */
  matchSignal: matchSignalSchema.optional(),
  /**
   * The authoritative slash path of the matched Figma variable (e.g.
   * `primitive/color/primary`), else a best-effort path split from the code name.
   * Drives the Inspector's group-folder nesting (change: figma-native-token-model).
   */
  figmaPath: z.string().optional(),
  /** Group-folder segments (the path minus its leaf label), for indented display. Absent → treat as []. */
  group: z.array(z.string()).optional(),
  /**
   * Per-mode view (mode NAME → that mode's values + drift), when the token file
   * has more than one mapped code context or Figma has multiple modes. The
   * top-level rawValue/resolvedValue/figmaValue/drift mirror the default mode.
   */
  modes: z
    .record(
      z.string(),
      z.object({
        rawValue: z.string(),
        resolvedValue: z.string(),
        figmaValue: z.string().optional(),
        drift: tokenDriftSchema.optional(),
        /** True when this mode has no mapped code context — Figma value is read-only. */
        readOnly: z.boolean().default(false),
      }),
    )
    .optional(),
  /**
   * Set when this token is declared NOT in the project's own token file but in a file that file
   * `@import`s — most often a consumed library's theme inside `node_modules` (change:
   * design-system-token-editor). The value is that file's project-relative path. Absent → the project's
   * own token file declares it. A token from a dependency is read-only in place: an edit to it routes to
   * the durable overlay instead of mutating the package.
   */
  fromImport: z.string().optional(),
});
export type InspectorToken = z.infer<typeof inspectorTokenSchema>;

/**
 * The scalar Figma variable type (change: figma-native-token-model — moved up so
 * the variable model can reference it). Push only ever writes COLOR/FLOAT/STRING;
 * BOOLEAN is accepted on capture so a boolean variable round-trips faithfully.
 */
export const figmaVariableTypeSchema = z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]);
export type FigmaVariableType = z.infer<typeof figmaVariableTypeSchema>;

/** A mode of a Figma variable collection (change: figma-native-token-model). */
export const figmaModeSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type FigmaMode = z.infer<typeof figmaModeSchema>;

/**
 * A variable's value in one mode: either a concrete resolved value, or an alias
 * to another variable (recorded by its slash-path name), mirroring Figma's
 * `VariableAlias`. Both may be present — `value` is the resolved concrete value
 * even when `aliasOf` names the reference (the code-side analog of `var(--x)`).
 */
export const figmaModeValueSchema = z.object({
  value: z.string().optional(),
  aliasOf: z.string().optional(),
});
export type FigmaModeValue = z.infer<typeof figmaModeValueSchema>;

/**
 * A design variable exported from Figma (via figma-cli or a scoped Claude Code
 * run), the authoritative source. `name` is the full slash path (e.g.
 * `primitive/color/primary`) so group folders survive. `resolvedValue` remains
 * the default-mode value for back-compat; `valuesByMode` (keyed by mode NAME,
 * which is human-diffable and stable across re-export) carries every mode.
 */
export const figmaVariableSchema = z.object({
  name: z.string(),
  resolvedValue: z.string(),
  type: tokenTypeSchema.optional(),
  collection: z.string().optional(),
  /** The Figma resolved type (COLOR/FLOAT/STRING/BOOLEAN), when known. */
  resolvedType: figmaVariableTypeSchema.optional(),
  /**
   * The variable's publish-stable **key** — the durable join to a code token
   * (change: figma-durable-keys / Plan B1). Survives file rebuilds and renames,
   * so it is the highest-precedence resolver signal. Empty/absent for a local,
   * unpublished variable — the resolver then falls back to name/value/alias.
   */
  key: z.string().optional(),
  /** mode name → value in that mode. Absent for a legacy single-value export. */
  valuesByMode: z.record(z.string(), figmaModeValueSchema).optional(),
});
export type FigmaVariable = z.infer<typeof figmaVariableSchema>;

/** A Figma variable collection: its ordered modes + default mode. */
export const figmaCollectionSchema = z.object({
  name: z.string(),
  modes: z.array(figmaModeSchema).default([]),
  defaultModeId: z.string().optional(),
});
export type FigmaCollection = z.infer<typeof figmaCollectionSchema>;

/**
 * The full mode/group/alias-aware variable model held in
 * `.vortspec/figma-variables.json` (new object shape). A legacy flat array/map
 * is parsed into this as a single `Default`-mode collection.
 */
export const figmaVariableModelSchema = z.object({
  collections: z.array(figmaCollectionSchema).default([]),
  variables: z.array(figmaVariableSchema).default([]),
});
export type FigmaVariableModel = z.infer<typeof figmaVariableModelSchema>;

/**
 * The persisted convention-free escape hatch (`.vortspec/token-links.json`):
 * normalized code-token name → the Figma variable's slash path. Read first by the
 * resolver so a user-confirmed match survives later renames on either side.
 */
export const tokenLinkMapSchema = z.record(z.string(), z.string());
export type TokenLinkMap = z.infer<typeof tokenLinkMapSchema>;

/**
 * The durable token join table (`.vortspec/maps/tokens.json`, Plan B1): normalized
 * code-token name → the Figma variable's publish-stable `variableKey`, plus the
 * value last seen in Figma (for drift detection, Plan B4). Unlike token-links (which
 * joins by the Figma *name/path*, and so breaks on a Figma rename), this joins by the
 * durable key — the highest-precedence resolver signal. Recorded whenever a code
 * token is confidently matched to a keyed Figma variable (sync, link-confirm, push).
 */
export const tokenKeyEntrySchema = z.object({
  variableKey: z.string(),
  /** the variable's resolved value when the key was last recorded (drift baseline). */
  value: z.string().optional(),
});
export type TokenKeyEntry = z.infer<typeof tokenKeyEntrySchema>;

export const tokenKeyMapSchema = z.object({
  tokens: z.record(z.string(), tokenKeyEntrySchema).default({}),
});
export type TokenKeyMap = z.infer<typeof tokenKeyMapSchema>;

/**
 * The durable component join table (`.vortspec/maps/components.json`, Plan B1c):
 * normalized code-component name → its Figma `componentKey` (durable join) +
 * `componentSetId` (fast in-file lookup) + `dependsOn` (the other DS components it
 * renders, so generation can resolve nested instances bottom-up). Mirrors the token
 * map; the component key is the highest-precedence reconcile signal.
 */
export const componentKeyEntrySchema = z.object({
  componentKey: z.string().optional(),
  componentSetId: z.string().optional(),
  /** normalized names of other roster components this one renders (for bottom-up order). */
  dependsOn: z.array(z.string()).default([]),
});
export type ComponentKeyEntry = z.infer<typeof componentKeyEntrySchema>;

export const componentKeyMapSchema = z.object({
  components: z.record(z.string(), componentKeyEntrySchema).default({}),
});
export type ComponentKeyMap = z.infer<typeof componentKeyMapSchema>;

/**
 * The durable screen ↔ Figma join table (`.vortspec/maps/screens.json`, change:
 * add-screen-to-figma): the per-project Figma `figmaFileKey` the screens live in, and
 * per screen (keyed by its stable route path or source file) the source `file` + Figma
 * `figmaNodeId` of its frame. Lets a re-send update the existing frame and a pull-back
 * target the right node.
 */
export const screenEntrySchema = z.object({
  file: z.string(),
  figmaNodeId: z.string(),
  updatedAt: z.string().optional(),
});
export type ScreenEntry = z.infer<typeof screenEntrySchema>;

export const screenMapSchema = z.object({
  figmaFileKey: z.string().optional(),
  screens: z.record(z.string(), screenEntrySchema).default({}),
});
export type ScreenMap = z.infer<typeof screenMapSchema>;

/**
 * Code→Figma push (change: add-code-to-figma-token-push, extended by
 * figma-native-token-model). A push plan is computed locally by diffing the code
 * token file against the Figma-variable cache; it is what the user previews and
 * confirms before any Figma write. VortSpec never writes Figma directly —
 * figma-cli or a scoped Claude Code run applies the plan.
 */

export const pushPlanEntrySchema = z.object({
  /** The Figma variable name to create/update — the full slash path so folders are preserved (e.g. `color/primary`). */
  variable: z.string(),
  /** create = no matching Figma variable yet; update = exists but drifted. */
  op: z.enum(["create", "update"]),
  /** Scalar Figma variable type to write. */
  figmaType: figmaVariableTypeSchema,
  /** Concrete value to set, when not an alias. */
  value: z.string().optional(),
  /** Normalized name of the Figma variable to alias to, when the code token is a `var(--x)` reference. */
  aliasTarget: z.string().optional(),
  /** The current Figma value being replaced (update only), for the preview. */
  currentFigmaValue: z.string().optional(),
  /** The source code token this entry derives from. */
  tokenName: z.string(),
  /** The source token's classified type (color/typography/…). */
  tokenType: tokenTypeSchema,
  /**
   * Token architecture layer, inferred from the name (change:
   * figma-native-token-model). Drives adaptive collection routing on push:
   * `primitive/*` land beside other primitives, `component/*` in a component
   * collection, everything else in the semantic collection.
   */
  layer: z.enum(["primitive", "semantic", "component"]).default("semantic"),
});
export type PushPlanEntry = z.infer<typeof pushPlanEntrySchema>;

export const pushPlanSchema = z.object({
  /** The Figma Variables collection the push targets (default `VortSpec`). */
  collection: z.string(),
  /** The mode NAME to write values into; absent → the collection's default/first mode. */
  mode: z.string().optional(),
  entries: z.array(pushPlanEntrySchema),
});
export type PushPlan = z.infer<typeof pushPlanSchema>;

export const figmaPushResultSchema = z.object({
  ok: z.boolean(),
  /** how many variables were created. */
  created: z.number(),
  /** how many variables were updated. */
  updated: z.number(),
  /** what applied the push, or null when no writer was available (→ MCP fallback / fix-it). */
  source: z.enum(["cli"]).nullable(),
  /** a human, next-step message. */
  message: z.string(),
});
export type FigmaPushResult = z.infer<typeof figmaPushResultSchema>;

/** One "where used" entry for the token detail drawer. */
export const tokenUsageSchema = z.object({
  component: z.string(),
  property: z.string().optional(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

/**
 * Token sanitation report (change: token-fidelity-sanitation). Surfaces code-only
 * tokens (orphans) with where they're used so the user can push them back to
 * Figma, and value look-alikes (duplicates) that should collapse to a canonical
 * token — so VortSpec stops minting tokens that already exist.
 */
export const orphanTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  /** Components/props that use this code-only token. */
  uses: z.array(tokenUsageSchema),
});
export type OrphanToken = z.infer<typeof orphanTokenSchema>;

export const duplicateGroupSchema = z.object({
  /** The shared resolved value. */
  value: z.string(),
  /** The canonical token the others should alias (a primitive for semantic-primitive). */
  canonical: z.string(),
  /** The look-alike tokens to collapse onto `canonical` (semantics only — never a sibling primitive). */
  tokens: z.array(z.string()),
  /** semantic-primitive = a flattened alias (semantic duplicating a primitive); semantic-semantic = two roles. */
  kind: z.enum(["semantic-primitive", "semantic-semantic"]),
});
export type DuplicateGroup = z.infer<typeof duplicateGroupSchema>;

export const tokenSanitationSchema = z.object({
  orphans: z.array(orphanTokenSchema).default([]),
  duplicates: z.array(duplicateGroupSchema).default([]),
});
export type TokenSanitation = z.infer<typeof tokenSanitationSchema>;

export const inspectorTokensResultSchema = z.object({
  /** Project-relative path of the token file that was parsed, or null if none. */
  tokenFile: z.string().nullable(),
  tokens: z.array(inspectorTokenSchema),
  /** token name → components/props that reference it (for the detail drawer). */
  usage: z.record(z.string(), z.array(tokenUsageSchema)),
  /** Figma variables with no matching code token (present only after a Figma sync). */
  figmaOnly: z.array(figmaVariableSchema).default([]),
  /** Whether a `.vortspec/figma-variables.json` export was found and reconciled. */
  figmaSynced: z.boolean().default(false),
  /**
   * The collections + their modes present in the Figma cache, for the collection
   * selector and mode switcher (change: figma-native-token-model). Empty until a
   * mode-aware Figma export is present.
   */
  collections: z.array(figmaCollectionSchema).default([]),
  /** The collection currently reconciled against + the push target, or null when unsynced. */
  activeCollection: z.string().nullable().default(null),
  /** The mode NAME currently reconciled/displayed, or null for a single-mode/legacy project. */
  activeMode: z.string().nullable().default(null),
  /** figma mode NAME → code context selector (`:root`, `.dark`, …); user-editable, persisted. */
  modeMap: z.record(z.string(), z.string()).default({}),
});
export type InspectorTokensResult = z.infer<typeof inspectorTokensResultSchema>;

// ── Components + Playground (Dev Preview screen) ─────────────────────

/** A prop control derived from the component's source (CVA variants / prop types). */
export const propControlSchema = z.object({
  key: z.string(),
  kind: z.enum(["enum", "boolean", "text"]),
  /** Options for an enum control. */
  options: z.array(z.string()).default([]),
  /** Default value from the component's defaultVariants, if any. */
  defaultValue: z.string().optional(),
  /** CVA classes per option (option → class string), for live variant preview + detection. */
  classes: z.record(z.string(), z.string()).default({}),
});
export type PropControl = z.infer<typeof propControlSchema>;

/** Validation status derived from the component's visual-verify report. */
export const componentStatusSchema = z.enum(["verified", "has-issues", "built", "unknown"]);
export type ComponentStatus = z.infer<typeof componentStatusSchema>;

export const inspectorComponentSchema = z.object({
  name: z.string(),
  // Loosened from a strict enum to tolerate whatever the detection wrote (an odd level
  // must never break the roster); the UI groups by atom/molecule/organism and buckets
  // anything else under "other".
  level: z.string().optional(),
  description: z.string().optional(),
  /** Project-relative path of the component's source file, or null if not found. */
  file: z.string().nullable(),
  props: z.array(propControlSchema),
  /** Token names the component references (best-effort scan of its source). */
  tokens: z.array(z.string()),
  status: componentStatusSchema,
  /** Open issues from the visual-verify report, if any. */
  issues: z.array(z.string()),
  /** Project-relative path of the component's spec dir/file, if one exists. */
  specPath: z.string().nullable(),
  /** Project-relative path of the visual-verify report, if one exists. */
  reportPath: z.string().nullable(),
  /** Detected variant-set axes (e.g. ["type","size"]) — a collapsed COMPONENT_SET / variant family. */
  variants: z.array(z.string()).optional(),
  /** Whether a matching component exists in the connected Figma file (Wave 3). */
  figmaBacked: z.boolean().optional(),
  /** The matched Figma component's variant axes, when figma-backed. */
  figmaVariants: z.array(z.string()).optional(),
  /** The matched Figma component's durable componentKey, when figma-backed (Plan B1c). */
  figmaKey: z.string().optional(),
  /** Other roster components this one renders — bottom-up generation order (Plan B1c). */
  dependsOn: z.array(z.string()).optional(),
});
export type InspectorComponent = z.infer<typeof inspectorComponentSchema>;

export const inspectorComponentsResultSchema = z.object({
  componentDir: z.string().nullable(),
  /** The dev-server URL to embed for live preview, if one is configured/known. */
  previewUrl: z.string().nullable(),
  components: z.array(inspectorComponentSchema),
  /** Figma components with no matching code component — designed, not yet built (Wave 3). */
  figmaOnly: z.array(figmaComponentSchema).default([]),
  /** Whether a `.vortspec/figma-components.json` export was found and reconciled. */
  figmaSynced: z.boolean().default(false),
});
export type InspectorComponentsResult = z.infer<typeof inspectorComponentsResultSchema>;

/**
 * A design-system audit (Plan B4): divergences the persistent index makes cheap to
 * find continuously — a component that hardcodes a value a token already names, or a
 * token whose code value drifted from its Figma variable. Severity-ranked so the UI
 * can lead with the ones that break design consistency.
 */
/**
 * WHEN an audit runs, and therefore what it can meaningfully conclude (OpenSpec change:
 * agentic-design-system, group 2c).
 *
 *  • `component-creation` — after components are built, before any screen exists. Subject: the
 *    generated per-tier validation pages. Question: does this component implement its tokens
 *    correctly?
 *  • `screen-generation` — after a screen is generated into the chosen framework and styling.
 *    Subject: the user's real screens. Question: does this screen compose components correctly, and
 *    did the conversion preserve token discipline?
 *
 * The scopes exist because THE SAME FINDING IS MEANINGFUL IN ONE AND FALSE IN THE OTHER. At
 * component creation every component is "unused" — there are no screens — so emitting that finding
 * there is pure noise, and a report that cries wolf is one people learn to scroll past. Conversely a
 * shadow implementation is impossible against a generated page, which always imports, and is one of
 * the most valuable findings against a real screen.
 */
export const auditScopeSchema = z.enum(["component-creation", "screen-generation"]);
export type AuditScope = z.infer<typeof auditScopeSchema>;

export const auditFindingSchema = z.object({
  /** Which audit produced this. Absent on a legacy finding written before scopes existed. */
  scope: auditScopeSchema.optional(),
  /**
   * What the finding was measured against — a generated validation page or a real screen. Recorded
   * because they are NOT equal evidence: a generated page proves a component renders and which
   * tokens it resolves, never that it is used correctly in context (task 2b.3).
   */
  subject: z.enum(["validation-page", "user-screen", "component-source"]).optional(),
  /** The component the finding is in, or "(tokens)" for a token-level drift. */
  component: z.string(),
  /** Project-relative file the finding points at, when known. */
  file: z.string().nullable(),
  severity: z.enum(["error", "warning"]),
  /**
   * Widened to the kinds `RULE_SCOPES` governs (task 2c.1). Without this the scope table named
   * rules a finding could not carry — the declaration and the data disagreed, and a rule could be
   * scoped without ever being emittable. Group 4 (task 4.2) adds the intent kinds on top.
   */
  kind: z.enum([
    "hardcoded-color",
    "token-drift",
    "unused",
    "shadow-implementation",
    "styling-lost-token",
    "wrong-variant-for-context",
    // Governance v2's intent kinds (task 4.2). These are ADDITIVE: every existence finding still
    // exists and still means what it did, so an intent audit's output is a strict superset.
    "hierarchy-inversion",
    "elevation-drift",
    "semantic-misuse",
    "typography-split",
  ]),
  /** A human, one-line description with the fix. */
  message: z.string(),
  /**
   * The governance rule that produced this, e.g. `hierarchy/background-token-on-text` (task 4.2).
   * Absent on an existence finding, which is not rule-driven — and on a legacy finding.
   */
  rule: z.string().optional(),
  /**
   * One line saying what to do INSTEAD. Separate from `message` because a message describes the
   * problem and a correction is actionable; a finding carrying only the former leaves the fix to be
   * invented, which is how "use a token" becomes a different wrong token.
   */
  correction: z.string().optional(),
});
export type AuditFinding = z.infer<typeof auditFindingSchema>;

export const designAuditSchema = z.object({
  findings: z.array(auditFindingSchema).default([]),
  summary: z.object({
    components: z.number(),
    findings: z.number(),
    /** how many tokens drifted from Figma. */
    drifted: z.number(),
  }),
});
export type DesignAudit = z.infer<typeof designAuditSchema>;

/**
 * AI-ready per-component metadata: the curated brief an agent reads when it composes or edits with
 * a component, so it uses it as intended instead of inferring intent from source.
 *
 * OpenSpec change: agentic-design-system, task 1.1. This schema WIDENS the original four-field
 * record (`summary`/`usage`/`patterns`/`antiPatterns`) to the nine sections
 * `.sdd-de/docs/component-metadata-model.md` already specified. Those were two schemas for one
 * thing: the good one was a Storybook deliverable that no runtime code read, and the thin one was
 * what actually reached the model. Widening — rather than adding a second `aiMetadataSchema`
 * alongside — is the whole point; a legacy record migrates on READ (`migrateComponentMetadata`).
 *
 * Records live at `.vortspec/metadata/<norm>.json`: VortSpec-owned, never in the app's source,
 * which is what makes this work for a consume source whose component tree belongs to the client.
 */

export const componentTierSchema = z.enum(["atom", "molecule", "organism", "template"]);
export type ComponentTierName = z.infer<typeof componentTierSchema>;

export const componentKindSchema = z.enum([
  "interactive",
  "display",
  "input",
  "container",
  "navigation",
]);

/** What the component IS. The only required section — a record without it names nothing. */
export const metadataIdentitySchema = z.object({
  name: z.string(),
  category: componentTierSchema.optional(),
  type: componentKindSchema.optional(),
  /** One line: what it is for. */
  description: z.string().default(""),
  /** e.g. `@/components/Button/Button`. */
  importPath: z.string().optional(),
  figmaFile: z.string().optional(),
  figmaNode: z.string().optional(),
});
export type MetadataIdentity = z.infer<typeof metadataIdentitySchema>;

/**
 * An anti-pattern, as a TRIPLET rather than a sentence.
 *
 * Bare strings are rejected on purpose. "Don't use Button for navigation" tells a model what not to
 * do and leaves it to guess the alternative — which is the failure mode anti-patterns exist to
 * prevent. `alternative` is the field that actually changes generated code; without it the record
 * is a warning rather than a correction.
 */
export const antiPatternSchema = z.object({
  scenario: z.string(),
  reason: z.string().default(""),
  alternative: z.string().default(""),
});
export type AntiPattern = z.infer<typeof antiPatternSchema>;

export const commonPatternSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  /** Runnable JSX using the component's real API — copy-pasteable, not pseudocode. */
  code: z.string().default(""),
});

/** WHEN to reach for it, HOW to compose it, and what to do instead when it is the wrong choice. */
export const metadataUsageSchema = z.object({
  useCases: z.array(z.string()).default([]),
  commonPatterns: z.array(commonPatternSchema).default([]),
  antiPatterns: z.array(antiPatternSchema).default([]),
});

/** One variant axis value and what it is FOR — the selection signal, not just the enum. */
export const metadataVariantSchema = z.object({
  /** The axis, e.g. `variant` or `size`. */
  axis: z.string(),
  value: z.string(),
  purpose: z.string().default(""),
});

export const metadataPropSchema = z.object({
  name: z.string(),
  type: z.string().default(""),
  default: z.string().optional(),
  description: z.string().default(""),
  required: z.boolean().optional(),
});

/** What it composes WITH: the shape of object/array props, its slots, and its expected parents. */
export const metadataCompositionSchema = z.object({
  /** For an object/array prop: the fields each item carries. */
  itemShape: z
    .array(
      z.object({
        field: z.string(),
        type: z.string().default(""),
        required: z.boolean().optional(),
        description: z.string().default(""),
      }),
    )
    .default([]),
  /** Named slots / children this component renders. */
  slots: z.array(z.object({ name: z.string(), description: z.string().default("") })).default([]),
  /** Components this one is normally placed inside, or normally contains. */
  worksWith: z.array(z.string()).default([]),
});

/** How it BEHAVES: the states it can be in and what drives them. */
export const metadataBehaviorSchema = z.object({
  states: z.array(z.object({ state: z.string(), description: z.string().default("") })).default([]),
  interactions: z.array(z.string()).default([]),
});

export const metadataAccessibilitySchema = z.object({
  role: z.string().optional(),
  keyboard: z.string().optional(),
  screenReader: z.string().optional(),
  wcag: z.string().optional(),
  notes: z.array(z.string()).default([]),
});

/** Token role → resolved value, per visual group. Resolved at generation time, from the artifact. */
const tokenRoleListSchema = z
  .array(z.object({ role: z.string(), token: z.string().default(""), value: z.string().default("") }))
  .default([]);

export const metadataDesignTokensSchema = z.object({
  colors: tokenRoleListSchema,
  typography: tokenRoleListSchema,
  spacing: tokenRoleListSchema,
  shadows: tokenRoleListSchema,
  radius: tokenRoleListSchema,
});

/**
 * The section aimed squarely at generation. `selectionCriteria` is the one a composer reads FIRST —
 * "reach for this when …" — which is why it is separate from `usage.useCases` (what it is for) and
 * from `keywords` (how it is found).
 */
export const metadataAiHintsSchema = z.object({
  context: z.string().default(""),
  selectionCriteria: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  generationRules: z.array(z.string()).default([]),
});

export const componentMetadataSchema = z.object({
  /** The roster name this record is keyed by; `identity.name` is the display name. */
  name: z.string(),
  identity: metadataIdentitySchema,
  usage: metadataUsageSchema.default({ useCases: [], commonPatterns: [], antiPatterns: [] }),
  variants: z.array(metadataVariantSchema).default([]),
  props: z.array(metadataPropSchema).default([]),
  composition: metadataCompositionSchema
    .default({ itemShape: [], slots: [], worksWith: [] })
    .optional(),
  behavior: metadataBehaviorSchema.default({ states: [], interactions: [] }).optional(),
  accessibility: metadataAccessibilitySchema.default({ notes: [] }).optional(),
  designTokens: metadataDesignTokensSchema
    .default({ colors: [], typography: [], spacing: [], shadows: [], radius: [] })
    .optional(),
  aiHints: metadataAiHintsSchema
    .default({ context: "", selectionCriteria: [], keywords: [], generationRules: [] })
    .optional(),
  /**
   * How this record was produced. `migrated` marks a legacy four-field record widened on read — it
   * is never written back in that state, because a triplet with two empty fields is not equivalent
   * to an authored one and marking it complete would hide the regeneration that is actually needed.
   */
  origin: z.enum(["authored", "migrated"]).optional(),
});
export type ComponentMetadata = z.infer<typeof componentMetadataSchema>;

/**
 * Coverage of AI-ready metadata across the component roster.
 *
 * Three states, not two (OpenSpec change: agentic-design-system, task 1.5). "Has a file" was the old
 * question and it is the wrong one: a legacy record migrated on read HAS a file and still cannot
 * tell a model when to reach for the component. Collapsing `incomplete` into `withMetadata` reports
 * a design system as covered while the records that reach the model are hollow — which is exactly
 * the state this change exists to find and fix.
 */
export const metadataStatusSchema = z.object({
  total: z.number(),
  /** Components with a record that carries everything an agent needs. */
  complete: z.number(),
  /** Components whose record exists but is migrated or missing an actionable section. */
  incomplete: z.array(z.object({ name: z.string(), gaps: z.array(z.string()).default([]) })).default([]),
  /** Roster component names with no metadata file at all. */
  missing: z.array(z.string()).default([]),
  /**
   * Components with a file, complete or not.
   * @deprecated Kept so an existing reader does not silently start counting something else; prefer
   * `complete` plus `incomplete.length`, which say which of the two a component actually is.
   */
  withMetadata: z.number(),
});
export type MetadataStatus = z.infer<typeof metadataStatusSchema>;

/** Metadata coverage plus the ready-to-run prompt that generates the missing files (Plan B6). */
export const metadataPlanSchema = metadataStatusSchema.extend({ prompt: z.string() });
export type MetadataPlan = z.infer<typeof metadataPlanSchema>;

/**
 * Whether the design-system index still describes the code (OpenSpec change:
 * agentic-design-system, task 2.9). `built: false` means absent, which is NOT stale.
 */
export const indexStalenessSchema = z.object({
  stale: z.boolean(),
  built: z.boolean(),
  generatedAt: z.string().nullable(),
  /** Changed files, capped and newest first. */
  changed: z.array(z.string()).default([]),
  changedCount: z.number(),
  message: z.string(),
});
export type IndexStalenessResult = z.infer<typeof indexStalenessSchema>;

/**
 * The outcome of a report-generation pass (OpenSpec change: agentic-design-system, task 4.7).
 *
 * `deferred` is surfaced rather than folded into `violations` because the two are different claims:
 * a violation is a finding, a deferred check is one nobody has judged yet. Summing them would let a
 * project read as failing for checks that never ran.
 */
export const reportResultSchema = z.object({
  /** Project-relative paths written. */
  written: z.array(z.string()).default([]),
  violations: z.number(),
  deferred: z.number(),
  rulesFrom: z.enum(["project", "defaults", "malformed"]),
  consumeSource: z.boolean(),
  /**
   * The violations themselves, so the Issues view can show them without reading the report file
   * back and re-parsing markdown it just wrote (task 4.8).
   */
  findings: z.array(auditFindingSchema).default([]),
});
export type ReportResultPayload = z.infer<typeof reportResultSchema>;

/** A captured file (project-relative path + content), for gated revert of a modify run. */
export const fileSnapshotSchema = z.object({ path: z.string(), content: z.string() });
export type FileSnapshot = z.infer<typeof fileSnapshotSchema>;
export const fileSnapshotListSchema = z.array(fileSnapshotSchema);

// ── Verification (visual-verify + adversarial-review findings) ────────

export const findingSeveritySchema = z.enum(["error", "warning", "info"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const verificationFindingSchema = z.object({
  /** Stable id: `<component>:<raw id>` (e.g. `callout:D2`). */
  id: z.string(),
  /** Short raw id from the report (e.g. `D2`, `O-A`). */
  rawId: z.string(),
  component: z.string(),
  group: z.enum(["visual", "adversarial"]),
  severity: findingSeveritySchema,
  title: z.string(),
  detail: z.string(),
  /** A referenced file/token from the finding, if one was found. */
  ref: z.string().optional(),
  status: z.enum(["open", "resolved"]),
  /** Project-relative path of the report the finding came from. */
  reportPath: z.string(),
});
export type VerificationFinding = z.infer<typeof verificationFindingSchema>;

export const verificationResultSchema = z.object({
  findings: z.array(verificationFindingSchema),
});
export type VerificationResult = z.infer<typeof verificationResultSchema>;
