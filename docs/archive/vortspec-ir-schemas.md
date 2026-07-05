# VortSpec IR Schemas v1

> The Intermediate Representation (IR) is the single source of truth of VortSpec.
> Every design source (Figma, ZIP exports, Stitch, native library) is elevated into this
> canonical format. Every downstream module (Design Inspector, Component Factory,
> Screen Builder, codegen) consumes only the IR and never the raw source.
>
> The canonical semantic standard is modeled on Figma's semantic richness:
> variables/tokens, styles, component variants, auto-layout, and typed props.
> Poorer sources (raw HTML/CSS from ZIP exports) must be enriched up to this
> standard during normalization, with every inference tracked via provenance.

**Implementation rule:** these schemas MUST be implemented as Zod schemas in
`packages/ir`. TypeScript types are derived via `z.infer`. Zod is the single
source of truth; never hand-write parallel interfaces.

---

## 1. Shared primitives

```ts
// ---------- Identity ----------
// All ids are prefixed nanoid strings for debuggability:
// tok_x7Kd..., cmp_9fQ2..., nod_kL0p..., scr_..., thm_..., pat_...
type Id = string;

// ---------- Provenance & confidence ----------
// Every extracted or inferred artifact carries provenance. This is the
// backbone of the Design Inspector UX (badges, review queues) and of
// trust in the pipeline.

type SourceKind =
  | 'figma'        // Figma REST API adapter
  | 'zip-html'     // generic ZIP adapter (HTML/CSS exports: Stitch, Claude Design, others)
  | 'stitch-mcp'   // phase 4, reserved
  | 'native'       // phase 5, VortSpec native library
  | 'user';        // created or edited manually in the Inspector

type Confidence =
  | 'confirmed'    // came from explicit source semantics (Figma variable) or user action
  | 'inferred'     // produced by mining/inference (deterministic or LLM), not yet reviewed
  | 'pending';     // inference flagged as low-certainty, requires review before approval

interface Provenance {
  source: SourceKind;
  sourceRef?: string;      // e.g. Figma node id, file path inside ZIP, CSS selector
  extractor: string;       // adapter + stage that produced it, e.g. 'zip-html/token-miner@1'
  extractedAt: string;     // ISO 8601
  confidence: Confidence;
  confirmedBy?: 'user' | 'rule';  // set when confidence becomes 'confirmed'
  inferredBy?: 'deterministic' | 'llm';  // required when confidence != source-native
}
```

---

## 2. Design tokens

Tokens are always referenced by id, never by value, anywhere else in the IR.
This is a hard invariant: it is what makes theming (phase 5) a pure value-map
swap and what powers "where is this used" in the Inspector.

```ts
type TokenType =
  | 'color'
  | 'typography'   // composite: family, size, weight, lineHeight, letterSpacing
  | 'spacing'
  | 'sizing'
  | 'radius'
  | 'border'       // composite: width, style, color-ref
  | 'shadow'       // composite, supports multiple layers
  | 'opacity'
  | 'zIndex'
  | 'motion';      // composite: duration, easing

// ---------- Typed values ----------
type ColorValue      = { hex: string; alpha?: number };            // '#2563EB'
type DimensionValue  = { value: number; unit: 'px' | 'rem' | '%' };
type TypographyValue = {
  fontFamily: string;
  fontSize: DimensionValue;
  fontWeight: number;                  // 100-900
  lineHeight: DimensionValue | number; // number = unitless multiplier
  letterSpacing?: DimensionValue;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
};
type ShadowLayer     = { x: number; y: number; blur: number; spread: number; colorRef: Id | ColorValue; inset?: boolean };
type ShadowValue     = { layers: ShadowLayer[] };
type BorderValue     = { width: DimensionValue; style: 'solid' | 'dashed' | 'dotted'; colorRef: Id };
type MotionValue     = { duration: number /* ms */; easing: string /* cubic-bezier or keyword */ };

type TokenValue =
  | { type: 'color';      value: ColorValue }
  | { type: 'typography'; value: TypographyValue }
  | { type: 'spacing';    value: DimensionValue }
  | { type: 'sizing';     value: DimensionValue }
  | { type: 'radius';     value: DimensionValue }
  | { type: 'border';     value: BorderValue }
  | { type: 'shadow';     value: ShadowValue }
  | { type: 'opacity';    value: number }         // 0-1
  | { type: 'zIndex';     value: number }
  | { type: 'motion';     value: MotionValue };

interface DesignToken {
  id: Id;                       // tok_...
  name: string;                 // semantic path: 'color/primary/500', 'radius/md'
  type: TokenType;
  value: TokenValue;
  aliasOf?: Id;                 // semantic alias: 'color/action/default' -> 'color/primary/500'.
                                // When set, `value` is ignored and resolved through the alias chain.
  description?: string;
  deprecated?: boolean;         // soft-delete: kept for history, excluded from pickers
  provenance: Provenance;
}

// Usage is COMPUTED, never stored on the token. Recomputed on every IR mutation.
interface TokenUsage {
  tokenId: Id;
  count: number;
  refs: Array<{
    componentId: Id;
    nodePath: string;           // 'root/children[0]/children[2]'
    property: string;           // 'styles.background', 'layout.gap'
  }>;
}

// ---------- Themes (phase 5 consumer, schema defined now) ----------
interface Theme {
  id: Id;                        // thm_...
  name: string;                  // 'default', 'dark', 'client-acme'
  overrides: Record<Id, TokenValue>;  // tokenId -> value; unset tokens fall back to base
}
```

**Normalization rules for tokens:**

- The token miner extracts every literal style value from the source and groups
  exact duplicates. Groups above the promotion threshold (default: used 2+ times,
  configurable) become token candidates with `confidence: 'inferred'`.
- LLM assistance is used only for semantic naming and role grouping of candidates
  (e.g. "this blue used on buttons and links is likely `color/primary`"). The LLM
  never invents values; it only names and groups values that were mined.
- Near-duplicate detection (e.g. three greys within a small delta-E) produces
  merge suggestions, never auto-merges.
- When the user uploads a companion design system (tokens JSON, CSS variables,
  or a second ZIP), mined values are matched against official tokens. Conflicts
  (same role, different value) are surfaced as Inspector issues, never resolved silently.

---

## 3. Component IR

```ts
type ComponentStatus =
  | 'imported'     // raw output of an adapter, pre-normalization
  | 'normalized'   // passed the pipeline, awaiting user review in Inspector
  | 'approved'     // user validated tokens/structure in Inspector (phase 1 exit state)
  | 'validated';   // passed the Component Factory SDD pipeline (phase 2 exit state)

interface ComponentIR {
  id: Id;                        // cmp_...
  name: string;                  // 'Button'
  slug: string;                  // 'button' (stable, used in codegen filenames)
  description?: string;
  status: ComponentStatus;
  provenance: Provenance;
  version: number;               // monotonically increasing; every applied patch bumps it

  variantAxes: VariantAxis[];
  props: PropDef[];
  slots: SlotDef[];
  states: InteractionState[];

  structure: IRNode;             // the base (default-variant) node tree
  variantOverrides: VariantOverride[];

  a11y: A11yMeta;
  completeness: CompletenessReport;
}

// ---------- Variants ----------
// Maps 1:1 to Figma variant properties and, in codegen, to CVA variant axes.
interface VariantAxis {
  name: string;                  // 'intent', 'size'
  options: string[];             // ['primary', 'secondary', 'ghost']
  default: string;
  provenance: Provenance;        // inferred axes must be reviewable individually
}

// Overrides describe how a variant combination diverges from the base structure.
interface VariantOverride {
  selector: Record<string, string>;   // { intent: 'ghost' } or { intent: 'primary', size: 'sm' }
  nodeOverrides: Array<{
    nodePath: string;                 // path into `structure`
    styles?: Partial<Record<StyleProperty, StyleValue>>;
    layout?: Partial<LayoutSpec>;
    visible?: boolean;                // node hidden in this variant
    text?: Partial<TextSpec>;
  }>;
}

// ---------- Props ----------
type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'node';

interface PropDef {
  name: string;                  // 'label', 'disabled', 'icon'
  type: PropType;
  enumValues?: string[];         // required when type === 'enum'
  default?: string | number | boolean;
  required: boolean;
  description?: string;
  control?: ControlHint;         // powers the Screen Builder property panel (phase 3)
  provenance: Provenance;
}

type ControlHint =
  | { kind: 'text' }
  | { kind: 'toggle' }
  | { kind: 'select' }
  | { kind: 'slider'; min: number; max: number; step?: number }
  | { kind: 'slot-picker' };     // for node props

// ---------- Slots ----------
interface SlotDef {
  name: string;                  // 'children', 'icon-left'
  allowedComponents?: Id[];      // empty/undefined = any approved component
  maxItems?: number;
  provenance: Provenance;
}

// ---------- Interaction states ----------
interface InteractionState {
  name: 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error';
  nodeOverrides: VariantOverride['nodeOverrides'];  // same shape, keyed by state
  provenance: Provenance;
}

// ---------- Accessibility ----------
interface A11yMeta {
  role?: string;                 // implicit or explicit ARIA role
  focusable?: boolean;
  labelStrategy?: 'text-content' | 'aria-label-prop' | 'labelled-by-slot';
  notes?: string[];
  contrastIssues?: Array<{ nodePath: string; foregroundRef: Id; backgroundRef: Id; ratio: number }>;
}
```

---

## 4. IR node tree

```ts
type NodeType = 'frame' | 'text' | 'icon' | 'image' | 'instance' | 'slot';

// The layout model is Figma auto-layout semantics, which map cleanly to flexbox.
interface LayoutSpec {
  mode: 'flex' | 'grid' | 'none';
  direction?: 'row' | 'column';
  gap?: StyleValue;
  padding?: { top: StyleValue; right: StyleValue; bottom: StyleValue; left: StyleValue };
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  // grid-only:
  columns?: number;
  rows?: number;
}

type StyleProperty =
  | 'background' | 'color' | 'borderColor' | 'borderWidth' | 'borderStyle'
  | 'radius' | 'shadow' | 'opacity' | 'width' | 'height'
  | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'
  | 'typography' | 'zIndex' | 'motion' | 'overflow';

// THE core invariant of the whole system:
// a style value is either a token reference or an explicitly flagged literal.
// Flagged literals are debt made visible; the Inspector offers "promote to token"
// and the completeness score penalizes them. There is no third option.
type StyleValue =
  | { kind: 'token';   tokenId: Id }
  | { kind: 'literal'; value: string | number; flagged: true };

interface TextSpec {
  content?: string;              // static text, if any
  bindToProp?: string;           // prop name whose value renders here
  typographyRef?: StyleValue;    // must resolve to a typography token
}

interface IRNode {
  id: Id;                        // nod_...
  type: NodeType;
  name: string;                  // human-readable, from source layer name or inferred
  layout?: LayoutSpec;
  styles: Partial<Record<StyleProperty, StyleValue>>;
  text?: TextSpec;               // type === 'text'
  slotName?: string;             // type === 'slot': which SlotDef this renders
  instance?: {                   // type === 'instance': nested component usage
    componentId: Id;
    variantSelection: Record<string, string>;
    propBindings: Record<string, string | number | boolean>;
  };
  children?: IRNode[];
  provenance: Provenance;
}
```

---

## 5. Completeness report

Computed by the pipeline after normalization and recomputed after every patch.
This is the number the Inspector shows per component and what gates approval.

```ts
interface CompletenessReport {
  score: number;                 // 0-100, weighted composite
  computedAt: string;
  metrics: {
    tokenizedStyleRatio: number;      // token refs / total style values
    confirmedTokenRatio: number;      // confirmed tokens used / tokens used
    variantAxesConfirmed: number;     // confirmed axes / total axes
    statesCovered: number;            // detected interaction states / expected baseline
    namedNodesRatio: number;          // meaningfully named nodes / total nodes
    a11yChecksPassed: number;
  };
  issues: CompletenessIssue[];
}

interface CompletenessIssue {
  id: Id;
  severity: 'error' | 'warning' | 'info';
  kind:
    | 'flagged-literal'          // style value not tokenized
    | 'unconfirmed-inference'    // token/axis/prop inferred but not reviewed
    | 'token-conflict'           // mined value vs official DS value mismatch
    | 'near-duplicate-tokens'    // merge suggestion
    | 'unused-token'
    | 'missing-state'            // e.g. no disabled state on an interactive component
    | 'contrast-failure'
    | 'unnamed-node';
  message: string;               // human-readable, ES or EN per user locale
  targets: Array<{ componentId?: Id; tokenId?: Id; nodePath?: string }>;
  suggestedAction?: IRPatch;     // one-click fix when deterministic
}
```

---

## 6. IR patches (edits, both direct and conversational)

Every mutation of the IR, whether from a click in the Inspector or from a chat
command, is expressed as an IRPatch. This gives us: uniform undo/redo, a full
audit trail, versioning, and the diff-preview UX for LLM-generated edits.

```ts
type PatchOp =
  // token ops
  | { op: 'token.create';  token: DesignToken }
  | { op: 'token.update';  tokenId: Id; changes: Partial<Pick<DesignToken, 'name' | 'value' | 'description' | 'aliasOf'>> }
  | { op: 'token.merge';   sourceTokenIds: Id[]; targetTokenId: Id }   // rewrites all refs
  | { op: 'token.delete';  tokenId: Id; fallback: 'inline-literal' | { replacementTokenId: Id } }
  | { op: 'token.promoteLiteral'; componentId: Id; nodePath: string; property: string; newToken: DesignToken }
  // component ops
  | { op: 'component.rename';       componentId: Id; name: string }
  | { op: 'component.setStatus';    componentId: Id; status: ComponentStatus }
  | { op: 'component.updateNode';   componentId: Id; nodePath: string; changes: Partial<Pick<IRNode, 'name' | 'styles' | 'layout' | 'text'>> }
  | { op: 'component.axis.update';  componentId: Id; axisName: string; changes: Partial<VariantAxis> }
  | { op: 'component.axis.confirm'; componentId: Id; axisName: string }
  | { op: 'component.prop.update';  componentId: Id; propName: string; changes: Partial<PropDef> }
  | { op: 'component.discard';      componentId: Id };

interface IRPatch {
  id: Id;                        // pat_...
  projectId: Id;
  ops: PatchOp[];
  summary: string;               // 'Merged 3 grey tokens into color/neutral/500'
  generatedBy: 'user' | 'llm';
  status: 'proposed' | 'applied' | 'rejected';   // llm patches start as 'proposed'
  createdAt: string;
  appliedAt?: string;
  baseVersion: number;           // optimistic concurrency: reject if IR moved on
}
```

**Conversational editing contract (Inspector chat):**

1. User writes a command in natural language (ES or EN).
2. The LLM receives the current token table + component summaries + the command,
   and must return ONLY a valid IRPatch (JSON), validated against the Zod schema.
3. Invalid output is retried once with the validation error appended; a second
   failure surfaces a friendly error, never a partial apply.
4. The patch renders as a visual diff (before/after per op). Nothing mutates
   until the user approves. Approval applies atomically and bumps `version`.

---

## 7. Screen IR (phase 3, schema reserved now)

Defined now so phase 1 decisions do not paint us into a corner. Not implemented
in phase 1 beyond the Zod schema existing in `packages/ir`.

```ts
interface ScreenIR {
  id: Id;                        // scr_...
  name: string;
  version: number;
  root: ScreenNode;
}

type ScreenNode =
  | {
      kind: 'instance';
      id: Id;
      componentId: Id;           // MUST reference an approved/validated component
      variantSelection: Record<string, string>;
      props: Record<string, string | number | boolean>;
      slots: Record<string, ScreenNode[]>;
    }
  | {
      kind: 'layout';            // structural container, maps to flex/grid in codegen
      id: Id;
      name: string;
      layout: LayoutSpec;
      styles: Partial<Record<StyleProperty, StyleValue>>;
      children: ScreenNode[];
    }
  | {
      kind: 'text';              // free text block outside components
      id: Id;
      text: TextSpec;
    };
```

Invariant: the Screen Builder can only compose approved components. There is no
free-form drawing. This is a product decision, not a technical limitation: it is
what guarantees every screen exports to design-system-consistent code.

---

## 8. Example: normalized Button (abbreviated)

```json
{
  "id": "cmp_btn01",
  "name": "Button",
  "slug": "button",
  "status": "normalized",
  "version": 3,
  "provenance": { "source": "zip-html", "sourceRef": "components/button.html", "extractor": "zip-html/structure-inferrer@1", "extractedAt": "2026-07-04T10:12:00Z", "confidence": "inferred", "inferredBy": "deterministic" },
  "variantAxes": [
    { "name": "intent", "options": ["primary", "secondary", "ghost"], "default": "primary",
      "provenance": { "source": "zip-html", "extractor": "zip-html/variant-inferrer@1", "extractedAt": "2026-07-04T10:12:01Z", "confidence": "inferred", "inferredBy": "llm" } },
    { "name": "size", "options": ["sm", "md", "lg"], "default": "md",
      "provenance": { "source": "zip-html", "extractor": "zip-html/variant-inferrer@1", "extractedAt": "2026-07-04T10:12:01Z", "confidence": "confirmed", "confirmedBy": "user" } }
  ],
  "props": [
    { "name": "label", "type": "string", "required": true, "control": { "kind": "text" },
      "provenance": { "source": "user", "extractor": "inspector", "extractedAt": "2026-07-04T11:00:00Z", "confidence": "confirmed", "confirmedBy": "user" } },
    { "name": "disabled", "type": "boolean", "default": false, "required": false, "control": { "kind": "toggle" },
      "provenance": { "source": "zip-html", "extractor": "zip-html/state-inferrer@1", "extractedAt": "2026-07-04T10:12:02Z", "confidence": "inferred", "inferredBy": "deterministic" } }
  ],
  "slots": [],
  "states": [
    { "name": "hover",
      "nodeOverrides": [ { "nodePath": "root", "styles": { "background": { "kind": "token", "tokenId": "tok_primary600" } } } ],
      "provenance": { "source": "zip-html", "sourceRef": ".btn:hover", "extractor": "zip-html/state-inferrer@1", "extractedAt": "2026-07-04T10:12:02Z", "confidence": "inferred", "inferredBy": "deterministic" } }
  ],
  "structure": {
    "id": "nod_root", "type": "frame", "name": "root",
    "layout": { "mode": "flex", "direction": "row", "gap": { "kind": "token", "tokenId": "tok_space2" },
      "padding": { "top": { "kind": "token", "tokenId": "tok_space2" }, "right": { "kind": "token", "tokenId": "tok_space4" }, "bottom": { "kind": "token", "tokenId": "tok_space2" }, "left": { "kind": "token", "tokenId": "tok_space4" } },
      "align": "center", "justify": "center" },
    "styles": {
      "background": { "kind": "token", "tokenId": "tok_primary500" },
      "radius": { "kind": "token", "tokenId": "tok_radiusmd" },
      "color": { "kind": "literal", "value": "#FFFFFF", "flagged": true }
    },
    "children": [
      { "id": "nod_label", "type": "text", "name": "label",
        "styles": { "typography": { "kind": "token", "tokenId": "tok_typebtn" } },
        "text": { "bindToProp": "label" },
        "provenance": { "source": "zip-html", "sourceRef": ".btn > span", "extractor": "zip-html/structure-inferrer@1", "extractedAt": "2026-07-04T10:12:01Z", "confidence": "inferred", "inferredBy": "deterministic" } }
    ],
    "provenance": { "source": "zip-html", "sourceRef": ".btn", "extractor": "zip-html/structure-inferrer@1", "extractedAt": "2026-07-04T10:12:01Z", "confidence": "inferred", "inferredBy": "deterministic" }
  },
  "variantOverrides": [
    { "selector": { "intent": "ghost" },
      "nodeOverrides": [ { "nodePath": "root", "styles": { "background": { "kind": "token", "tokenId": "tok_transparent" }, "color": { "kind": "token", "tokenId": "tok_primary500" } } } ] }
  ],
  "a11y": { "role": "button", "focusable": true, "labelStrategy": "text-content", "notes": [] },
  "completeness": {
    "score": 82,
    "computedAt": "2026-07-04T11:00:05Z",
    "metrics": { "tokenizedStyleRatio": 0.9, "confirmedTokenRatio": 0.6, "variantAxesConfirmed": 0.5, "statesCovered": 0.5, "namedNodesRatio": 1, "a11yChecksPassed": 1 },
    "issues": [
      { "id": "iss_01", "severity": "warning", "kind": "flagged-literal",
        "message": "Text color #FFFFFF is a raw value. Promote it to a token?",
        "targets": [ { "componentId": "cmp_btn01", "nodePath": "root", "property": "styles.color" } ] }
    ]
  }
}
```

---

## 9. Invariants checklist (enforce in code and in review)

1. Tokens are referenced by id everywhere; literals are always `flagged: true`.
2. Every artifact born from extraction or inference carries `Provenance`.
3. LLMs propose IRPatches; they never mutate the IR directly.
4. All patches validate against Zod before preview and again before apply.
5. `version` uses optimistic concurrency; stale patches are rejected, not merged.
6. Deleting a token requires an explicit fallback strategy in the patch op.
7. Screen nodes may only instantiate approved or validated components.
8. Adapters output `ComponentIR` with `status: 'imported'`; only the pipeline
   moves it to `normalized`; only the user moves it to `approved`.
