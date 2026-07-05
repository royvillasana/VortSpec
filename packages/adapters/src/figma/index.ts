export {
  FigmaClient,
  type FigmaClientOptions,
  type FigmaNode,
  type FigmaFill,
  type FigmaEffect,
  type FigmaColor,
  type FigmaBoundVariable,
  type FigmaTextStyle,
  type FigmaComponentProperty,
  type FigmaComponentMeta,
  type FigmaComponentSetMeta,
  type FigmaStyleMeta,
  type FigmaVariable,
  type FigmaVariableValue,
  type FigmaVariableCollection,
  type FigmaFileResponse,
  type FigmaVariablesResponse,
  type FigmaComponentsResponse,
  type FigmaComponentSetsResponse,
  type FigmaStylesResponse,
  type FigmaNodesResponse,
} from "./client.js";

export { parseFigmaUrl } from "./url.js";

export {
  rgbaToHex,
  mapVariablesToTokens,
  mapFillToStyleValue,
  mapAutoLayoutToLayoutSpec,
  mapNodeToIRNode,
  mapComponentSetToIR,
  mapTextStylesToTokens,
  mineFills,
} from "./mapper.js";
