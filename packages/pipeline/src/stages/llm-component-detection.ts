import { llmJSON, logUsage } from "@vortspec/llm";
import { z } from "zod";
import { generateId } from "../lib/id";
import type {
  ComponentIR,
  IRNode,
  StyleValue,
  StyleProperty,
  LayoutSpec,
  Provenance,
  CompletenessReport,
} from "@vortspec/ir";

function makeProvenance(): Provenance {
  return {
    source: "zip-html",
    extractor: "zip-html/llm-component-detector@1",
    extractedAt: new Date().toISOString(),
    confidence: "inferred",
    inferredBy: "llm",
  };
}

function makeLiteral(value: string | number): StyleValue {
  return { kind: "literal" as const, value, flagged: true as const };
}

// Zod schema for LLM response validation
const DetectedComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  htmlSnippet: z.string(),
  category: z.enum(["navigation", "layout", "content", "interactive", "media", "form"]),
  isReusable: z.boolean(),
  occurrences: z.number(),
  variants: z.array(z.string()).optional(),
  props: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })).optional(),
  styles: z.record(z.string(), z.string()),
});

const ComponentDetectionResponseSchema = z.object({
  components: z.array(DetectedComponentSchema),
});

type DetectedComponent = z.infer<typeof DetectedComponentSchema>;

const SYSTEM_PROMPT = `You are a design system component detector. You analyze HTML/CSS from design exports and identify reusable UI components.

Your job is to look at the HTML and identify REAL, meaningful UI components — the kind a designer would put in a component library. Not every <div> is a component.

Rules:
- A component is a REUSABLE piece of UI that appears in multiple places or could be reused
- Navigation bars, headers, footers, cards, buttons, forms, modals, badges, inputs are components
- Generic layout containers (a div that just wraps other content) are NOT components
- A section of a page (hero, features list) IS a component if it has a distinct, repeatable pattern
- Look for semantic meaning, not just structural repetition
- Name components clearly: "Primary Button", "Navigation Bar", "Module Card", "Hero Section"
- Identify variants: "Primary Button" and "Secondary Button" are variants of "Button"
- Extract key styles that define the component's visual identity
- Aim for 5-15 high-quality components. Quality over quantity — fewer well-identified components are better than many low-confidence fragments

Return valid JSON only. No markdown fences, no explanation.`;

function buildUserPrompt(htmlSamples: Array<{ filename: string; html: string }>): string {
  // Truncate each HTML to avoid token limits — keep first 3000 chars
  const samples = htmlSamples.map((s) => {
    const truncated = s.html.length > 3000
      ? s.html.slice(0, 3000) + "\n<!-- ... truncated ... -->"
      : s.html;
    return `=== ${s.filename} ===\n${truncated}`;
  }).join("\n\n");

  return `Analyze these HTML pages from a design export. Identify the reusable UI components.

${samples}

Return a JSON object with this exact shape:
{
  "components": [
    {
      "name": "Component Name",
      "description": "What this component is and where it's used",
      "htmlSnippet": "<the relevant HTML fragment, max 500 chars>",
      "category": "navigation|layout|content|interactive|media|form",
      "isReusable": true,
      "occurrences": 3,
      "variants": ["primary", "secondary"],
      "props": [{ "name": "label", "type": "string", "description": "Button text" }],
      "styles": { "background": "#FF4D24", "color": "#FAF3E7", "border-radius": "999px" }
    }
  ]
}

Focus on quality over quantity. 5-15 real components is better than 60 fragments.
Only include components where isReusable is true.`;
}

/**
 * Build an IRNode from the detected component's HTML snippet and styles.
 */
function buildNodeFromDetection(comp: DetectedComponent): IRNode {
  const provenance = makeProvenance();
  const styles: Partial<Record<StyleProperty, StyleValue>> = {};

  // Map detected styles to IR StyleProperty
  const styleMap: Record<string, StyleProperty> = {
    "background": "background",
    "background-color": "background",
    "color": "color",
    "border-radius": "radius",
    "border-color": "borderColor",
    "border-width": "borderWidth",
    "box-shadow": "shadow",
    "opacity": "opacity",
    "width": "width",
    "height": "height",
  };

  for (const [cssProp, value] of Object.entries(comp.styles)) {
    const irProp = styleMap[cssProp];
    if (irProp) {
      styles[irProp] = makeLiteral(value);
    }
  }

  // Typography aggregation
  const typoParts: string[] = [];
  for (const [p, v] of Object.entries(comp.styles)) {
    if (["font-family", "font-size", "font-weight", "line-height", "letter-spacing"].includes(p)) {
      typoParts.push(`${p}: ${v}`);
    }
  }
  if (typoParts.length > 0) {
    styles.typography = makeLiteral(typoParts.join("; "));
  }

  return {
    id: generateId("nod"),
    type: comp.category === "interactive" ? "frame" : comp.category === "media" ? "image" : "frame",
    name: comp.name.toLowerCase().replace(/\s+/g, "-"),
    styles: Object.keys(styles).length > 0 ? styles : undefined,
    layout: comp.category === "navigation" || comp.category === "layout"
      ? { mode: "flex" as const, direction: "row" as const, align: "center" as const }
      : undefined,
    provenance,
  };
}

/**
 * Use LLM to detect meaningful UI components from HTML files.
 */
export async function detectComponentsWithLLM(
  files: Array<{ path: string; content: string }>,
  options?: { projectId?: string },
): Promise<{ components: ComponentIR[]; model: string; tokensUsed: number }> {
  // Filter to HTML files only, take up to 5 representative pages
  const htmlFiles = files
    .filter((f) => f.path.toLowerCase().endsWith(".html") || f.path.toLowerCase().endsWith(".htm"))
    .slice(0, 5);

  if (htmlFiles.length === 0) {
    return { components: [], model: "none", tokensUsed: 0 };
  }

  const samples = htmlFiles.map((f) => ({ filename: f.path, html: f.content }));

  const result = await llmJSON(
    SYSTEM_PROMPT,
    buildUserPrompt(samples),
    (data) => ComponentDetectionResponseSchema.parse(data),
    { temperature: 0, maxTokens: 4096, projectId: options?.projectId, purpose: "component-detection" },
  );

  const provenance = makeProvenance();
  const components: ComponentIR[] = [];

  for (const detected of result.data.components) {
    if (!detected.isReusable) continue;

    const structure = buildNodeFromDetection(detected);
    const id = generateId("cmp");
    const slug = detected.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const variantAxes = detected.variants && detected.variants.length > 1
      ? [{
          name: "variant",
          options: detected.variants,
          default: detected.variants[0],
          provenance,
        }]
      : [];

    const props = (detected.props ?? []).map((p) => ({
      name: p.name,
      type: (p.type === "boolean" ? "boolean" : p.type === "number" ? "number" : "string") as "string" | "number" | "boolean" | "enum" | "node",
      required: false,
      description: p.description,
      provenance,
    }));

    const completeness: CompletenessReport = {
      score: 0,
      computedAt: new Date().toISOString(),
      metrics: {
        tokenizedStyleRatio: 0,
        confirmedTokenRatio: 0,
        variantAxesConfirmed: 0,
        statesCovered: 0,
        namedNodesRatio: 1, // LLM named them
        a11yChecksPassed: 0.5,
      },
      issues: [],
    };

    components.push({
      id,
      name: detected.name,
      slug,
      description: detected.description,
      status: "imported",
      provenance,
      version: 1,
      variantAxes,
      props,
      slots: [],
      states: [],
      structure,
      variantOverrides: [],
      a11y: {},
      completeness,
    });
  }

  return {
    components,
    model: result.model,
    tokensUsed: result.tokensIn + result.tokensOut,
  };
}

/** Alias for consistent naming with other stage functions. */
export const runLLMComponentDetectionCore = detectComponentsWithLLM;
