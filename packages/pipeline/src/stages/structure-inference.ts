import { load, getClasses, childSignature, type CheerioAPI, type Element } from "../lib/html-parser";
import { extractStylesFromCSS, extractEmbeddedCSS, type CSSDeclaration } from "../lib/css-parser";
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
  IRNode,
  StyleValue,
  StyleProperty,
  LayoutSpec,
  Provenance,
} from "@vortspec/ir";

// ---- CSS property -> StyleProperty mapping ----
const CSS_TO_STYLE_PROP: Record<string, StyleProperty> = {
  "background-color": "background",
  background: "background",
  color: "color",
  "border-color": "borderColor",
  "border-width": "borderWidth",
  "border-style": "borderStyle",
  "border-radius": "radius",
  "box-shadow": "shadow",
  opacity: "opacity",
  width: "width",
  height: "height",
  "min-width": "minWidth",
  "max-width": "maxWidth",
  "min-height": "minHeight",
  "max-height": "maxHeight",
  "font-family": "typography",
  "font-size": "typography",
  "font-weight": "typography",
  "line-height": "typography",
  overflow: "overflow",
  "z-index": "zIndex",
};

// ---- Layout inference ----
const ALIGN_MAP: Record<string, LayoutSpec["align"]> = {
  "flex-start": "start", "flex-end": "end", center: "center",
  stretch: "stretch", baseline: "baseline", start: "start", end: "end",
};
const JUSTIFY_MAP: Record<string, LayoutSpec["justify"]> = {
  "flex-start": "start", "flex-end": "end", center: "center",
  "space-between": "between", "space-around": "around", start: "start", end: "end",
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

function inferLayout(styles: Map<string, string>): LayoutSpec | undefined {
  const display = styles.get("display");
  if (!display) return undefined;
  if (display === "flex" || display === "inline-flex") {
    const layout: LayoutSpec = { mode: "flex" };
    const dir = styles.get("flex-direction");
    layout.direction = dir === "column" ? "column" : "row";
    const a = styles.get("align-items");
    if (a && ALIGN_MAP[a]) layout.align = ALIGN_MAP[a];
    const j = styles.get("justify-content");
    if (j && JUSTIFY_MAP[j]) layout.justify = JUSTIFY_MAP[j];
    const g = styles.get("gap");
    if (g) layout.gap = makeFlaggedLiteral(g);
    if (styles.get("flex-wrap") === "wrap") layout.wrap = true;
    return layout;
  }
  if (display === "grid") return { mode: "grid" };
  return undefined;
}

function buildStyles(styles: Map<string, string>): Partial<Record<StyleProperty, StyleValue>> | undefined {
  const result: Partial<Record<StyleProperty, StyleValue>> = {};
  let count = 0;
  const layoutProps = new Set(["display", "flex-direction", "align-items", "justify-content", "gap", "flex-wrap"]);

  for (const [prop, val] of styles) {
    if (layoutProps.has(prop)) continue;
    const mapped = CSS_TO_STYLE_PROP[prop];
    if (!mapped) continue;
    if (mapped === "typography") {
      const existing = result.typography;
      if (existing && existing.kind === "literal") {
        result.typography = makeFlaggedLiteral(`${String(existing.value)}; ${prop}: ${val}`);
      } else {
        result.typography = makeFlaggedLiteral(`${prop}: ${val}`);
      }
    } else {
      result[mapped] = makeFlaggedLiteral(val);
    }
    count++;
  }
  return count > 0 ? result : undefined;
}

/**
 * Collect all CSS styles for an element (class-based + inline).
 */
function collectElementStyles(
  el: Element,
  $: CheerioAPI,
  classDecls: Map<string, CSSDeclaration[]>,
): Map<string, string> {
  const styles = new Map<string, string>();
  const classes = getClasses(el, $);

  // Class-based styles
  for (const cls of classes) {
    for (const [selector, decls] of classDecls) {
      if (selector.includes(`.${cls}`) && !selector.includes(":")) {
        for (const d of decls) styles.set(d.property, d.value);
      }
    }
  }

  // Inline styles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const styleAttr = $(el as any).attr("style");
  if (styleAttr) {
    for (const pair of styleAttr.split(";")) {
      const i = pair.indexOf(":");
      if (i < 0) continue;
      const p = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (p && v) styles.set(p, v);
    }
  }

  return styles;
}

/**
 * Build an IRNode from a DOM element.
 */
function buildIRNode(
  el: Element,
  $: CheerioAPI,
  classDecls: Map<string, CSSDeclaration[]>,
  provenance: Provenance,
  depth: number = 0,
): IRNode {
  const tag = el.tagName?.toLowerCase() ?? "div";
  const isText = ["span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "label", "a", "strong", "em", "b", "i"].includes(tag);
  const isImage = tag === "img" || tag === "svg";
  const nodeType = isText ? "text" : isImage ? "image" : "frame";

  const allStyles = collectElementStyles(el, $, classDecls);
  const layout = inferLayout(allStyles);
  const styles = buildStyles(allStyles);

  const classes = getClasses(el, $);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childElements = $(el as any).children().toArray().filter((c: any) => c.type === "tag");
  const children: IRNode[] = childElements.map((child: unknown) =>
    buildIRNode(child as Element, $, classDecls, provenance, depth + 1),
  );

  const node: IRNode = {
    id: generateId("nod"),
    type: nodeType,
    name: classes[0] ?? `${tag}-${depth}`,
    provenance,
  };

  if (layout) node.layout = layout;
  if (styles) node.styles = styles;

  if (nodeType === "text") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textContent = $(el as any).contents().filter(function (this: any) {
      return this.type === "text";
    }).text().trim();
    if (textContent) node.text = { content: textContent };
  }

  if (children.length > 0) node.children = children;
  return node;
}

/**
 * Generate a structural fingerprint for a DOM element.
 * Uses tag name + child tag sequence + whether it has styles.
 * Ignores text content and specific style values.
 */
function structuralFingerprint(el: Element, $: CheerioAPI, depth: number = 0): string {
  if (depth > 5) return el.tagName ?? "?"; // cap recursion
  const tag = el.tagName?.toLowerCase() ?? "?";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kids = $(el as any).children().toArray();
  if (kids.length === 0) return tag;
  const childSigs = kids
    .filter((c: any) => c.type === "tag")
    .map((c: unknown) => structuralFingerprint(c as Element, $, depth + 1));
  return `${tag}[${childSigs.join(",")}]`;
}

export interface StructureInferenceResult {
  components: ComponentIR[];
  candidateCount: number;
}

/**
 * Core structure inference — detects repeated DOM patterns as component candidates.
 *
 * Detection strategy (in priority order):
 * 1. Class-based: elements sharing a primary CSS class with similar child structure (2+ instances)
 * 2. Structure-based: elements with identical structural fingerprint (tag + child shape) regardless of classes (3+ instances)
 * 3. Semantic-based: common interactive elements (button, input, select, a with specific patterns)
 */
export function runStructureInferenceCore(
  files: Array<{ path: string; content: string }>,
  styleGroups: StyleGroup[],
): StructureInferenceResult {
  const components: ComponentIR[] = [];
  let candidateIndex = 0;

  // Collect all CSS declarations
  const allCSSDecls: CSSDeclaration[] = [];
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith(".css")) {
      allCSSDecls.push(...extractStylesFromCSS(file.content, file.path));
    } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      for (const css of extractEmbeddedCSS(file.content)) {
        allCSSDecls.push(...extractStylesFromCSS(css, file.path));
      }
    }
  }

  // Build class -> declarations map (strip file prefixes from selectors)
  const classDecls = new Map<string, CSSDeclaration[]>();
  for (const d of allCSSDecls) {
    const raw = d.selector.includes("::") ? d.selector.split("::").slice(1).join("::") : d.selector;
    const arr = classDecls.get(raw) ?? [];
    arr.push(d);
    classDecls.set(raw, arr);
  }

  const usedElements = new Set<Element>();

  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (!lower.endsWith(".html") && !lower.endsWith(".htm")) continue;
    const $ = load(file.content);

    // ─── Strategy 1: Class-based detection ───
    const elemsByPrimaryClass = new Map<string, Element[]>();
    const classElements = $("[class]").toArray() as Element[];

    for (const el of classElements) {
      const classes = getClasses(el, $);
      if (classes.length === 0) continue;
      const primary = classes[0];
      const arr = elemsByPrimaryClass.get(primary) ?? [];
      arr.push(el);
      elemsByPrimaryClass.set(primary, arr);
    }

    for (const [primaryClass, elements] of elemsByPrimaryClass) {
      if (elements.length < 2) continue;
      const sigs = elements.map((el) => childSignature(el, $));
      const similar = elements.filter((_, i) => sigs[i] === sigs[0]);
      if (similar.length < 2) continue;

      candidateIndex++;
      const provenance = makeProvenance();
      const structure = buildIRNode(similar[0], $, classDecls, provenance);

      const componentClasses = new Set<string>();
      for (const el of similar) {
        for (const cls of getClasses(el, $)) componentClasses.add(cls);
      }

      // Variant axes from secondary classes
      const variantAxes: VariantAxis[] = [];
      const variantOverrides: VariantOverride[] = [];
      const allSecondary = new Set<string>();
      for (const el of similar) {
        for (const cls of getClasses(el, $)) {
          if (cls !== primaryClass) allSecondary.add(cls);
        }
      }
      if (allSecondary.size > 0) {
        const opts = [...allSecondary];
        const axisName = `variant-axis-${candidateIndex}`;
        variantAxes.push({ name: axisName, options: opts.map((_, i) => `variant-${i + 1}`), default: "variant-1", provenance });
        for (let i = 0; i < opts.length; i++) {
          const variantDecls: CSSDeclaration[] = [];
          for (const [sel, decls] of classDecls) {
            if (sel.includes(`.${opts[i]}`) && !sel.includes(":")) variantDecls.push(...decls);
          }
          const m = new Map<string, string>();
          for (const d of variantDecls) m.set(d.property, d.value);
          const s = buildStyles(m);
          if (s) variantOverrides.push({ selector: { [axisName]: `variant-${i + 1}` }, nodeOverrides: [{ nodePath: "/root", styles: s as Record<StyleProperty, StyleValue> }] });
        }
      }

      // Interaction states
      const states = extractInteractionStates(componentClasses, allCSSDecls);

      for (const el of similar) usedElements.add(el);

      components.push(buildComponent(candidateIndex, structure, variantAxes, variantOverrides, states));
    }

    // ─── Strategy 2: Structure-based detection (for inline-styled elements) ───
    const fingerprintGroups = new Map<string, Element[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allElements = $("body *").toArray() as Element[];

    for (const el of allElements) {
      if (usedElements.has(el)) continue;
      // Only consider elements with children (leaf nodes aren't components)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kids = $(el as any).children().toArray();
      if (kids.filter((c: any) => c.type === "tag").length === 0) continue;

      const fp = structuralFingerprint(el, $);
      if (fp.length < 5) continue; // skip trivially simple structures
      const arr = fingerprintGroups.get(fp) ?? [];
      arr.push(el);
      fingerprintGroups.set(fp, arr);
    }

    for (const [, elements] of fingerprintGroups) {
      if (elements.length < 2) continue;

      candidateIndex++;
      const provenance = makeProvenance();
      const structure = buildIRNode(elements[0], $, classDecls, provenance);

      // Inline-style variant detection: find style differences between instances
      const variantAxes: VariantAxis[] = [];
      const variantOverrides: VariantOverride[] = [];

      if (elements.length >= 2) {
        const baseStyles = collectElementStyles(elements[0], $, classDecls);
        const diffs: Array<{ index: number; diffProps: Map<string, string> }> = [];

        for (let i = 1; i < elements.length; i++) {
          const elStyles = collectElementStyles(elements[i], $, classDecls);
          const diffProps = new Map<string, string>();
          for (const [prop, val] of elStyles) {
            if (baseStyles.get(prop) !== val) diffProps.set(prop, val);
          }
          if (diffProps.size > 0) diffs.push({ index: i, diffProps });
        }

        if (diffs.length > 0) {
          const axisName = `variant-axis-${candidateIndex}`;
          const options = ["variant-1", ...diffs.map((_, i) => `variant-${i + 2}`)];
          variantAxes.push({ name: axisName, options, default: "variant-1", provenance });

          for (let i = 0; i < diffs.length; i++) {
            const s = buildStyles(diffs[i].diffProps);
            if (s) {
              variantOverrides.push({
                selector: { [axisName]: `variant-${i + 2}` },
                nodeOverrides: [{ nodePath: "/root", styles: s as Record<StyleProperty, StyleValue> }],
              });
            }
          }
        }
      }

      for (const el of elements) usedElements.add(el);
      components.push(buildComponent(candidateIndex, structure, variantAxes, variantOverrides, []));
    }

    // ─── Strategy 3: Semantic element detection ───
    const semanticTags = ["button", "input", "select", "textarea", "nav", "header", "footer", "form"];
    for (const tag of semanticTags) {
      const elements = $(tag).toArray().filter((el) => !usedElements.has(el as Element)) as Element[];
      if (elements.length === 0) continue;

      candidateIndex++;
      const provenance = makeProvenance();
      const structure = buildIRNode(elements[0], $, classDecls, provenance);
      for (const el of elements) usedElements.add(el);

      const a11y: A11yMeta = {};
      if (["button", "input", "select", "textarea"].includes(tag)) {
        a11y.role = tag === "button" ? "button" : "textbox";
        a11y.focusable = true;
      }

      const comp = buildComponent(candidateIndex, structure, [], [], []);
      comp.a11y = a11y;
      comp.name = `${tag}-${candidateIndex}`;
      comp.slug = `${tag}-${candidateIndex}`;
      components.push(comp);
    }
  }

  // ─── Deduplication pass ───
  // Group components by structural fingerprint and merge duplicates
  const deduped = deduplicateComponents(components);

  return { components: deduped, candidateCount: deduped.length };
}

/**
 * Generate a fingerprint for an IRNode tree (ignoring IDs and specific values).
 */
function irNodeFingerprint(node: IRNode, depth: number = 0): string {
  if (depth > 8) return node.type;
  const kids = (node.children ?? []).map((c) => irNodeFingerprint(c, depth + 1)).join(",");
  const styleKeys = node.styles ? Object.keys(node.styles).sort().join("+") : "";
  return `${node.type}:${styleKeys}${kids ? `[${kids}]` : ""}`;
}

/**
 * Deduplicate components by structural fingerprint.
 * When duplicates are found, keep the one with the most styles/children
 * and derive a better name from the HTML tag.
 */
function deduplicateComponents(components: ComponentIR[]): ComponentIR[] {
  const groups = new Map<string, ComponentIR[]>();

  for (const comp of components) {
    const fp = irNodeFingerprint(comp.structure);
    const arr = groups.get(fp) ?? [];
    arr.push(comp);
    groups.set(fp, arr);
  }

  const result: ComponentIR[] = [];
  let index = 0;

  for (const [, group] of groups) {
    // Pick the best representative (most children/styles)
    const best = group.reduce((a, b) => {
      const aSize = JSON.stringify(a.structure).length;
      const bSize = JSON.stringify(b.structure).length;
      return bSize > aSize ? b : a;
    });

    index++;
    const tag = best.structure.type === "text" ? (best.structure.name || "text") : (best.structure.name || "frame");
    const baseName = inferComponentName(best, tag, index);

    best.name = baseName;
    best.slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    best.description = group.length > 1
      ? `Detected ${group.length} instances across pages`
      : undefined;

    // Merge variant info from duplicates
    if (group.length > 1) {
      for (const dup of group) {
        if (dup === best) continue;
        for (const axis of dup.variantAxes) {
          if (!best.variantAxes.some((a) => a.name === axis.name)) {
            best.variantAxes.push(axis);
          }
        }
        for (const state of dup.states) {
          if (!best.states.some((s) => s.name === state.name)) {
            best.states.push(state);
          }
        }
      }
    }

    result.push(best);
  }

  return result;
}

/**
 * Try to derive a meaningful name from the component's structure.
 */
function inferComponentName(comp: ComponentIR, tag: string, index: number): string {
  const rootTag = comp.structure.type === "frame"
    ? (comp.structure.name || "div")
    : comp.structure.type;

  // Use semantic tag names
  const semanticNames: Record<string, string> = {
    nav: "Navigation",
    header: "Header",
    footer: "Footer",
    button: "Button",
    input: "Input",
    form: "Form",
    select: "Select",
    textarea: "TextArea",
    section: "Section",
    article: "Article",
    aside: "Sidebar",
    ul: "List",
    ol: "OrderedList",
    li: "ListItem",
    table: "Table",
  };

  // Check root tag
  for (const [htmlTag, name] of Object.entries(semanticNames)) {
    if (rootTag === htmlTag || tag === htmlTag) return `${name}-${index}`;
  }

  // Check if it contains text (likely a text component)
  if (comp.structure.type === "text" && comp.structure.text?.content) {
    const text = comp.structure.text.content.slice(0, 20).replace(/[^a-zA-Z0-9 ]/g, "").trim();
    if (text) return `Text-${text.split(" ")[0]}-${index}`;
  }

  // Check children count for layout detection
  const childCount = comp.structure.children?.length ?? 0;
  if (comp.structure.layout?.mode === "flex" && childCount > 2) return `FlexGroup-${index}`;
  if (comp.structure.layout?.mode === "grid") return `Grid-${index}`;

  // Fallback
  if (comp.structure.type === "image") return `Icon-${index}`;
  if (comp.structure.type === "text") return `TextBlock-${index}`;

  return `Component-${index}`;
}

function buildComponent(
  index: number,
  structure: IRNode,
  variantAxes: VariantAxis[],
  variantOverrides: VariantOverride[],
  states: InteractionState[],
): ComponentIR {
  const provenance = makeProvenance();
  return {
    id: generateId("cmp"),
    name: `component-candidate-${index}`,
    slug: `component-candidate-${index}`,
    status: "imported",
    provenance,
    version: 1,
    variantAxes,
    props: [],
    slots: [],
    states,
    structure,
    variantOverrides,
    a11y: {},
    completeness: {
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
    },
  };
}

function extractInteractionStates(
  componentClasses: Set<string>,
  allDecls: CSSDeclaration[],
): InteractionState[] {
  const pseudos = ["hover", "focus", "active", "disabled"] as const;
  const states: InteractionState[] = [];

  for (const pseudo of pseudos) {
    const matching = allDecls.filter((d) => {
      if (!d.selector.includes(`:${pseudo}`)) return false;
      for (const cls of componentClasses) {
        if (d.selector.includes(`.${cls}`)) return true;
      }
      return false;
    });
    if (matching.length === 0) continue;

    const m = new Map<string, string>();
    for (const d of matching) m.set(d.property, d.value);
    const s = buildStyles(m);
    if (!s) continue;

    states.push({
      name: pseudo,
      nodeOverrides: [{ nodePath: "/root", styles: s as Record<StyleProperty, StyleValue> }],
      provenance: makeProvenance(),
    });
  }
  return states;
}
