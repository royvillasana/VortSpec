// ---------- Figma REST API Client ----------

const BASE_URL = "https://api.figma.com";
const MAX_RETRIES = 3;
const MAX_NODE_IDS_PER_REQUEST = 50;

// ---------- Figma API Types ----------

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaBoundVariable {
  id: string;
  type: string;
}

export interface FigmaFill {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "IMAGE";
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  boundVariables?: Record<string, FigmaBoundVariable>;
}

export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  visible?: boolean;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textCase?: string;
}

export interface FigmaComponentProperty {
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "INSTANCE_SWAP";
  defaultValue: string | boolean;
  variantOptions?: string[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  effects?: FigmaEffect[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  componentPropertyDefinitions?: Record<string, FigmaComponentProperty>;
  characters?: string;
  style?: FigmaTextStyle;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  componentId?: string;
  visible?: boolean;
}

export interface FigmaFileResponse {
  document: FigmaNode;
  components: Record<string, FigmaComponentMeta>;
  componentSets: Record<string, FigmaComponentSetMeta>;
  styles: Record<string, FigmaStyleMeta>;
  name: string;
  lastModified: string;
  version: string;
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks?: Array<{ uri: string }>;
}

export interface FigmaComponentSetMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks?: Array<{ uri: string }>;
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
  description: string;
}

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  valuesByMode: Record<string, FigmaVariableValue>;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: string[];
}

export type FigmaVariableValue =
  | FigmaColor
  | number
  | string
  | boolean
  | { type: "VARIABLE_ALIAS"; id: string };

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

export interface FigmaVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaComponentsResponse {
  status: number;
  error: boolean;
  meta: {
    components: Array<{
      key: string;
      file_key: string;
      node_id: string;
      name: string;
      description: string;
      containing_frame?: { name: string; nodeId: string };
    }>;
  };
}

export interface FigmaComponentSetsResponse {
  status: number;
  error: boolean;
  meta: {
    component_sets: Array<{
      key: string;
      file_key: string;
      node_id: string;
      name: string;
      description: string;
    }>;
  };
}

export interface FigmaStylesResponse {
  status: number;
  error: boolean;
  meta: {
    styles: Array<{
      key: string;
      file_key: string;
      node_id: string;
      style_type: "FILL" | "TEXT" | "EFFECT" | "GRID";
      name: string;
      description: string;
    }>;
  };
}

export interface FigmaNodesResponse {
  nodes: Record<
    string,
    {
      document: FigmaNode;
      components: Record<string, FigmaComponentMeta>;
      styles: Record<string, FigmaStyleMeta>;
    } | null
  >;
}

// ---------- Client ----------

export interface FigmaClientOptions {
  pat: string;
}

export class FigmaClient {
  private pat: string;

  constructor(options: FigmaClientOptions) {
    this.pat = options.pat;
  }

  private async request(path: string): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: {
          "X-Figma-Token": this.pat,
        },
      });

      if (response.status === 429) {
        // Rate limited — exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(`Rate limited (429) on ${path}`);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `Figma API error: ${response.status} ${response.statusText} on ${path}`,
        );
      }

      return response.json();
    }

    throw lastError ?? new Error(`Failed after ${MAX_RETRIES} retries`);
  }

  async getFile(fileKey: string, depth?: number): Promise<FigmaFileResponse> {
    const depthParam = depth != null ? `?depth=${depth}` : "?depth=1";
    return (await this.request(
      `/v1/files/${fileKey}${depthParam}`,
    )) as FigmaFileResponse;
  }

  async getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return (await this.request(
      `/v1/files/${fileKey}/variables/local`,
    )) as FigmaVariablesResponse;
  }

  async getComponents(fileKey: string): Promise<FigmaComponentsResponse> {
    return (await this.request(
      `/v1/files/${fileKey}/components`,
    )) as FigmaComponentsResponse;
  }

  async getComponentSets(
    fileKey: string,
  ): Promise<FigmaComponentSetsResponse> {
    return (await this.request(
      `/v1/files/${fileKey}/component_sets`,
    )) as FigmaComponentSetsResponse;
  }

  async getStyles(fileKey: string): Promise<FigmaStylesResponse> {
    return (await this.request(
      `/v1/files/${fileKey}/styles`,
    )) as FigmaStylesResponse;
  }

  async getNodes(
    fileKey: string,
    nodeIds: string[],
  ): Promise<FigmaNodesResponse> {
    // Batch node requests — max 50 IDs per call
    const batches: string[][] = [];
    for (let i = 0; i < nodeIds.length; i += MAX_NODE_IDS_PER_REQUEST) {
      batches.push(nodeIds.slice(i, i + MAX_NODE_IDS_PER_REQUEST));
    }

    const mergedNodes: FigmaNodesResponse["nodes"] = {};

    for (const batch of batches) {
      const ids = batch.join(",");
      const response = (await this.request(
        `/v1/files/${fileKey}/nodes?ids=${ids}`,
      )) as FigmaNodesResponse;

      Object.assign(mergedNodes, response.nodes);
    }

    return { nodes: mergedNodes };
  }
}
