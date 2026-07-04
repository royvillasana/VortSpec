// ─── VortSpec Intermediate Representation Types ────────────────────────────

// Provenance tracking
export type Confidence = 'confirmed' | 'inferred' | 'pending';

export interface Provenance {
  confidence: Confidence;
  source: string;
  extractor: string;
  importedAt: string;
}

// ─── Design Tokens ─────────────────────────────────────────────────────────

export type TokenKind = 'color' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'other';

export interface DesignToken {
  id: string;
  name: string;
  kind: TokenKind;
  value: string;
  resolvedValue: string;
  alias?: string;
  provenance: Provenance;
  usageCount: number;
  deprecated: boolean;
}

// ─── Component IR ──────────────────────────────────────────────────────────

export type ComponentStatus = 'imported' | 'normalized' | 'approved';

export interface VariantAxis {
  name: string;
  options: string[];
  provenance: Provenance;
}

export interface PropDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  default?: string;
  controlHint: 'text' | 'color' | 'toggle' | 'select' | 'number';
  options?: string[];
  provenance: Provenance;
}

export interface NodeBinding {
  nodePath: string;
  property: string;
  tokenId?: string;
  literalValue?: string;
  flagged: boolean;
}

export interface ComponentState {
  name: string;
  provenance: Provenance;
}

export interface StructureNode {
  tag: string;
  name: string;
  depth: number;
  bindings: NodeBinding[];
  children?: StructureNode[];
}

export interface CompletenessCheck {
  name: string;
  passed: boolean;
  value: string;
  detail?: string;
}

export interface CompletenessReport {
  score: number;
  checks: CompletenessCheck[];
}

export interface ComponentIR {
  id: string;
  name: string;
  status: ComponentStatus;
  variantAxes: VariantAxis[];
  props: PropDefinition[];
  states: ComponentState[];
  structure: StructureNode;
  bindings: NodeBinding[];
  completeness: CompletenessReport;
  provenance: Provenance;
  version: number;
}

// ─── Issues ────────────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueKind =
  | 'raw-value'
  | 'unconfirmed-inference'
  | 'possible-duplicate'
  | 'missing-state'
  | 'token-conflict'
  | 'low-contrast';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  kind: IssueKind;
  title: string;
  description: string;
  componentId?: string;
  componentName?: string;
  tokenId?: string;
  tokenName?: string;
  suggestedAction?: string;
  resolved: boolean;
  resolvedLabel?: string;
  createdAt: string;
}

// ─── Patches / History ─────────────────────────────────────────────────────

export type PatchAuthor = 'user' | 'assistant' | 'pipeline';
export type PatchStatus = 'applied' | 'rejected' | 'undone';

export interface PatchOperation {
  op: string;
  path: string;
  from?: string;
  to?: string;
}

export interface IRPatch {
  id: string;
  summary: string;
  author: PatchAuthor;
  status: PatchStatus;
  operations: PatchOperation[];
  baseVersion: number;
  resultVersion?: number;
  createdAt: string;
}

// ─── Projects ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  initial: string;
  accentColor: string;
  tokenCount: number;
  componentCount: number;
  approvedCount: number;
  completenessScore: number;
  source: string[];
  status: 'importing' | 'ready';
  importStage?: number;
  importTotalStages?: number;
  updatedAt: string;
}

// ─── Import Pipeline ───────────────────────────────────────────────────────

export type PipelineStageStatus = 'queued' | 'running' | 'done' | 'failed';

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  status: PipelineStageStatus;
  error?: string;
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  patch?: IRPatch;
  choices?: string[];
  drafting?: boolean;
  createdAt: string;
}

// ─── Token Usage Graph ─────────────────────────────────────────────────────

export interface TokenUsage {
  tokenId: string;
  componentId: string;
  componentName: string;
  nodePath: string;
  property: string;
}
