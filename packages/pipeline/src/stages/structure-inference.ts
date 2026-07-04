import { load, getClasses, childSignature, walkDOM, type CheerioAPI, type Element } from "../lib/html-parser";
import { extractStylesFromCSS, extractInlineStyles, extractEmbeddedCSS, type CSSDeclaration } from "../lib/css-parser";
import { generateId } from "../lib/id";
import type { StyleGroup } from "./style-mining";
import type {
  ComponentIR,
  VariantAxis,
  InteractionState,
  CompletenessReport,
  A11yMeta,
  VariantOverride,
  NodeOverride,
} from "@vortspec/ir";
import type {
  IRNode,
  StyleValue,
  StyleProperty,
  LayoutSpec,
} from "@vortspec/ir";
import type { Provenance } from "@vortspec/ir";

// ---- CSS property -> StyleProperty mapping ----
const CSS_TO_STYLE_PROP: Record<string, StyleProperty> = {
  "background-color": "background",
  "background": "background",
  "color": "color",
  "border-color": "borderColor",
  "border-width": "borderWidth",
  "border-style": "borderStyle",
  "border-radius": "radius",
  "box-shadow": "shadow",
  "opacity": "opacity",
  "width": "width",
  "height": "height",
  "min-width": "minWidth",
  "max-width": "maxWidth",
  "min-height": "minHeight",
  "max-height": "maxHeight",
  "font-family": "typography",
  "font-size": "typography",
  "font-weight": "typography",
  "line-height": "typography",
  "overflow": "overflow",
  "z-index": "zIndex",
};

// ---- Layout inference helpers ----
const ALIGN_MAP: Record<string, LayoutSpec["align"]> = {
  "flex-start": "start",
  "flex-end": "end",
  "center": "center",
  "stretch": "stretch",
  "baseline": "baseline",
  "start": "start",
  "end": "end",
};

const JUSTIFY_MAP: Record<string, LayoutSpec["justify"]> = {
  "flex-start": "start",
  "flex-end": "end",
  "center": "center",
  "space-between": "between",
  "space-around": "around",
  "start": "start",
  "end": "end",
};

function makeProvenance(): Provenance {
  return {
    source: "zip-html",
    extractor: "zip-html/structure-inferrer@1",
    extractedAt: new Date().toISOString(),
    confidence: "inferred",
    inferredBy: "deterministic",
  };
}

function makeFlaggedLiteral(value: string | number): StyleValue {
  return { kind: "literal" as const, value, flagged: true as const };
}

/**
 * Parse CSS declarations into a map keyed by selector (class name).
 */
function buildSelectorStyleMap(
  decls: CSSDeclaration[]
): Map<string, CSSDeclaration[]> {
  const map = new Map<string, CSSDeclaration[]>();
  for (const d of decls) {
    const arr = map.get(d.selector) ?? [];
    arr.push(d);
    map.set(d.selector, arr);
  }
  return map;
}

/**
 * Given a list of CSS declarations, infer a LayoutSpec.
 */
function inferLayout(decls: CSSDeclaration[]): LayoutSpec | undefined {
  const byProp = new Map<string, string>();
  for (const d of decls) byProp.set(d.property, d.value);

  const display = byProp.get("display");
  if (!display) return undefined;

  if (display === "flex" || display === "inline-flex") {
    const layout: LayoutSpec = { mode: "flex" };
    const dir = byProp.get("flex-direction");
    layout.direction = dir === "column" ? "column" : "row";

    const align = byProp.get("align-items");
    if (align && ALIGN_MAP[align]) layout.align = ALIGN_MAP[align];

    const justify = byProp.get("justify-content");
    if (justify && JUSTIFY_MAP[justify]) layout.justify = JUSTIFY_MAP[justify];

    const gap = byProp.get("gap");
    if (gap) layout.gap = makeFlaggedLiteral(gap);

    const wrap = byProp.get("flex-wrap");
    if (wrap === "wrap") layout.wrap = true;

    return layout;
  }

  if (display === "grid") {
    return { mode: "grid" };
  }

  return undefined;
}

/**
 * Given CSS declarations relevant to an element, build the styles record.
 */
function buildStylesFromDecls(
  decls: CSSDeclaration[]
): Partial<Record<StyleProperty, StyleValue>> | undefined {
  const styles: Partial<Record<StyleProperty, StyleValue>> = {};
  let count = 0;

  for (const d of decls) {
    const prop = CSS_TO_STYLE_PROP[d.property];
    if (!prop) continue;

    // Skip layout properties (handled separately)
    if (
      d.property === "display" ||
      d.property === "flex-direction" ||
      d.property === "align-items" ||
      d.property === "justify-content" ||
      d.property === "gap" ||
      d.property === "flex-wrap"
    ) {
      continue;
    }

    // For typography, aggregate as a single string value
    if (prop === "typography") {
      const existing = styles.typography;
      if (existing && existing.kind === "literal") {
        styles.typography = makeFlaggedLiteral(
          `${String(existing.value)}; ${d.property}: ${d.value}`
        );
      } else {
        styles.typography = makeFlaggedLiteral(`${d.property}: ${d.value}`);
      }
      count++;
      continue;
    }

    styles[prop] = makeFlaggedLiteral(d.value);
    count++;
  }

  return count > 0 ? styles : undefined;
}

/**
 * Build an IRNode tree from a cheerio element.
 */
function buildIRNode(
  el: Element,
  $: CheerioAPI,
  classDecls: Map<string, CSSDeclaration[]>,
  provenance: Provenance,
  depth: number = 0,
): IRNode {
  const tag = el.tagName?.toLowerCase() ?? "div";
  const classes = getClasses(el, $);
  const id = generateId("nod");

  // Determine node type
  const isText =
    tag === "span" ||
    tag === "p" ||
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "h5" ||
    tag === "h6" ||
    tag === "label" ||
    tag === "a";
  const isImage = tag === "img" || tag === "svg";
  const nodeType = isText ? "text" : isImage ? "image" : "frame";

  // Collect CSS declarations from all matching classes
  const allDecls: CSSDeclaration[] = [];
  for (const cls of classes) {
    // Look for declarations matching this class (simplified: match by `.className`)
    for (const [selector, decls] of classDecls) {
      // Match selectors that contain the class name (e.g. .btn, .btn-primary)
      if (
        selector.includes(`.${cls}`) &&
        !selector.includes(":")  // Skip pseudo-class selectors
      ) {
        allDecls.push(...decls);
      }
    }
  }

  // Also collect inline styles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const styleAttr = $(el as any).attr("style");
  if (styleAttr) {
    const pairs = styleAttr.split(";").filter((s) => s.trim());
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx < 0) continue;
      const property = pair.slice(0, colonIdx).trim();
      const value = pair.slice(colonIdx + 1).trim();
      if (property && value) {
        allDecls.push({ selector: "inline", property, value });
      }
    }
  }

  const layout = inferLayout(allDecls);
  const styles = buildStylesFromDecls(allDecls);

  // Build children
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childElements = $(el as any).children().toArray().filter((c) => c.type === "tag");
  const children: IRNode[] = childElements.map((child) =>
    buildIRNode(child as Element, $, classDecls, provenance, depth + 1)
  );

  const node: IRNode = {
    id,
    type: nodeType,
    name: classes[0] ?? `${tag}-${depth}`,
    provenance,
  };

  if (layout) node.layout = layout;
  if (styles) node.styles = styles;

  if (nodeType === "text") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textContent = $(el as any).contents().filter(function(this: any) {
      return this.type === "text";
    }).text().trim();
    if (textContent) {
      node.text = { content: textContent };
    }
  }

  if (children.length > 0) node.children = children;

  return node;
}

/**
 * Extract pseudo-class states from style groups for classes used by a component.
 */
function extractInteractionStates(
  styleGroups: StyleGroup[],
  componentClasses: Set<string>,
  allDecls: CSSDeclaration[],
): InteractionState[] {
  const pseudoClasses = ["hover", "focus", "active", "disabled"] as const;
  const states: InteractionState[] = [];

  for (const pseudo of pseudoClasses) {
    // Find declarations with pseudo-class selectors matching component classes
    const matchingDecls = allDecls.filter((d) => {
      if (!d.selector.includes(`:${pseudo}`)) return false;
      for (const cls of componentClasses) {
        if (d.selector.includes(`.${cls}`)) return true;
      }
      return false;
    });

    if (matchingDecls.length === 0) continue;

    const overrideStyles = buildStylesFromDecls(matchingDecls);
    if (!overrideStyles) continue;

    const overrides: NodeOverride[] = [
      {
        nodePath: "/root",
        styles: overrideStyles as Record<StyleProperty, StyleValue>,
      },
    ];

    states.push({
      name: pseudo,
      nodeOverrides: overrides,
      provenance: makeProvenance(),
    });
  }

  return states;
}

export interface StructureInferenceResult {
  components: ComponentIR[];
  candidateCount: number;
}

/**
 * Core structure inference logic -- pure function.
 * Finds repeated DOM patterns and builds ComponentIR objects.
 */
export function runStructureInferenceCore(
  files: Array<{ path: string; content: string }>,
  styleGroups: StyleGroup[],
): StructureInferenceResult {
  const components: ComponentIR[] = [];
  let candidateIndex = 0;

  // Collect all CSS declarations across all files for pseudo-class detection
  const allCSSDecls: CSSDeclaration[] = [];
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith(".css")) {
      allCSSDecls.push(...extractStylesFromCSS(file.content, file.path));
    } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      const embedded = extractEmbeddedCSS(file.content);
      for (const css of embedded) {
        allCSSDecls.push(...extractStylesFromCSS(css, file.path));
      }
    }
  }

  // Build class -> declarations map (for building node styles)
  // Use only the raw selector (class part), not the file prefix
  const classDecls = new Map<string, CSSDeclaration[]>();
  for (const d of allCSSDecls) {
    // The selector from extractStylesFromCSS is like "file.css::.btn-primary"
    // We want just the ".btn-primary" part for matching
    const rawSelector = d.selector.includes("::")
      ? d.selector.split("::").slice(1).join("::")
      : d.selector;

    const arr = classDecls.get(rawSelector) ?? [];
    arr.push(d);
    classDecls.set(rawSelector, arr);
  }

  // Process each HTML file
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (!lower.endsWith(".html") && !lower.endsWith(".htm")) continue;

    const $ = load(file.content);

    // Find all elements with class attributes
    const elemsByPrimaryClass = new Map<string, Element[]>();
    const allElements = $("[class]").toArray() as Element[];

    for (const el of allElements) {
      const classes = getClasses(el, $);
      if (classes.length === 0) continue;
      const primary = classes[0];
      const arr = elemsByPrimaryClass.get(primary) ?? [];
      arr.push(el);
      elemsByPrimaryClass.set(primary, arr);
    }

    // For each primary class group with 2+ instances
    for (const [primaryClass, elements] of elemsByPrimaryClass) {
      if (elements.length < 2) continue;

      // Check structural similarity using childSignature
      const sigs = elements.map((el) => childSignature(el, $));
      const baseSig = sigs[0];
      const similar = sigs.filter((s) => s === baseSig);

      // Need at least 2 structurally similar elements
      if (similar.length < 2) continue;

      candidateIndex++;
      const provenance = makeProvenance();

      // Build IRNode from first instance (base variant)
      const baseEl = elements[0];
      const structure = buildIRNode(baseEl, $, classDecls, provenance);

      // Collect all classes used by elements in this group
      const componentClasses = new Set<string>();
      for (const el of elements) {
        for (const cls of getClasses(el, $)) {
          componentClasses.add(cls);
        }
      }

      // Detect variant axes from secondary class differences
      const variantAxes: VariantAxis[] = [];
      const variantOverrides: VariantOverride[] = [];

      // Gather secondary classes (all classes except the primary)
      const secondaryClassSets = elements.map((el) => {
        const classes = getClasses(el, $);
        return classes.filter((c) => c !== primaryClass);
      });

      // Find unique secondary classes across all instances
      const allSecondary = new Set<string>();
      for (const set of secondaryClassSets) {
        for (const cls of set) allSecondary.add(cls);
      }

      if (allSecondary.size > 0) {
        const axisOptions = [...allSecondary];
        const axisName = `variant-axis-${candidateIndex}`;

        variantAxes.push({
          name: axisName,
          options: axisOptions.map((_, i) => `variant-${i + 1}`),
          default: "variant-1",
          provenance,
        });

        // Create variant overrides for each secondary class option
        for (let i = 0; i < axisOptions.length; i++) {
          const cls = axisOptions[i];
          // Find declarations for this secondary class
          const variantDecls: CSSDeclaration[] = [];
          for (const [selector, decls] of classDecls) {
            if (selector.includes(`.${cls}`) && !selector.includes(":")) {
              variantDecls.push(...decls);
            }
          }

          const overrideStyles = buildStylesFromDecls(variantDecls);
          if (overrideStyles) {
            variantOverrides.push({
              selector: { [axisName]: `variant-${i + 1}` },
              nodeOverrides: [
                {
                  nodePath: "/root",
                  styles: overrideStyles as Record<StyleProperty, StyleValue>,
                },
              ],
            });
          }
        }
      }

      // Detect interaction states from pseudo-class selectors
      const states = extractInteractionStates(
        styleGroups,
        componentClasses,
        allCSSDecls,
      );

      // Build completeness report (placeholder)
      const completeness: CompletenessReport = {
        score: 0,
        computedAt: new Date().toISOString(),
        metrics: {
          tokenizedStyleRatio: 0,
          confirmedTokenRatio: 0,
          variantAxesConfirmed: 0,
          statesCovered: states.length / 4,
          namedNodesRatio: 0,
          a11yChecksPassed: 0.5,
        },
        issues: [],
      };

      const a11y: A11yMeta = {};

      const componentId = generateId("cmp");
      const componentName = `component-candidate-${candidateIndex}`;

      const component: ComponentIR = {
        id: componentId,
        name: componentName,
        slug: componentName,
        status: "imported",
        provenance,
        version: 1,
        variantAxes,
        props: [],
        slots: [],
        states,
        structure,
        variantOverrides,
        a11y,
        completeness,
      };

      components.push(component);
    }
  }

  return { components, candidateCount: candidateIndex };
}
