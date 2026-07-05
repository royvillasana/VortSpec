/**
 * Builds a user prompt for React + Tailwind code generation.
 */

interface SimplifiedNode {
  type: string;
  name: string;
  styles?: Record<string, unknown>;
  children?: SimplifiedNode[];
}

function simplifyNode(node: Record<string, unknown>): SimplifiedNode {
  const result: SimplifiedNode = {
    type: String(node.type ?? "frame"),
    name: String(node.name ?? "unnamed"),
  };

  if (node.styles && typeof node.styles === "object") {
    result.styles = node.styles as Record<string, unknown>;
  }

  const children = node.children as Array<Record<string, unknown>> | undefined;
  if (children && Array.isArray(children) && children.length > 0) {
    result.children = children.map(simplifyNode);
  }

  return result;
}

function flattenTokenValue(tokenValue: unknown): string {
  if (!tokenValue || typeof tokenValue !== "object") return String(tokenValue ?? "");
  const v = tokenValue as Record<string, unknown>;
  const inner = v.value;
  if (typeof inner === "number") return String(inner);
  if (typeof inner === "string") return inner;
  if (typeof inner === "object" && inner !== null) {
    const obj = inner as Record<string, unknown>;
    if ("hex" in obj) return String(obj.hex);
    if ("value" in obj && "unit" in obj) return `${obj.value}${obj.unit}`;
    if ("fontFamily" in obj) {
      const fontSize = obj.fontSize as Record<string, unknown> | undefined;
      return `${obj.fontFamily} ${fontSize?.value ?? ""}${fontSize?.unit ?? ""}`;
    }
    if ("layers" in obj) return `${(obj.layers as unknown[]).length} layer(s)`;
    if ("width" in obj && "style" in obj) {
      const w = obj.width as Record<string, unknown>;
      return `${w?.value ?? ""}${w?.unit ?? ""} ${obj.style}`;
    }
    if ("duration" in obj) return `${obj.duration}ms ${obj.easing ?? ""}`;
  }
  return JSON.stringify(inner);
}

export function buildReactTailwindPrompt(
  componentIR: Record<string, unknown>,
  tokens: Array<Record<string, unknown>>,
  componentLibrary: string,
): string {
  const name = String(componentIR.name ?? "Component");
  const slug = String(componentIR.slug ?? "component");
  const description = componentIR.description
    ? String(componentIR.description)
    : `A ${name} component`;

  // Variant axes
  const variantAxes = (componentIR.variantAxes ?? []) as Array<Record<string, unknown>>;
  const variantsSection = variantAxes.length > 0
    ? variantAxes.map((axis) => {
        const options = (axis.options ?? []) as string[];
        return `  - ${axis.name}: [${options.map((o) => `"${o}"`).join(", ")}] (default: "${axis.default ?? options[0] ?? ""}")`;
      }).join("\n")
    : "  (none)";

  // Props
  const props = (componentIR.props ?? []) as Array<Record<string, unknown>>;
  const propsSection = props.length > 0
    ? props.map((p) => {
        const enumVals = (p.enumValues ?? []) as string[];
        const typeStr = p.type === "enum" && enumVals.length > 0
          ? enumVals.map((v) => `"${v}"`).join(" | ")
          : String(p.type ?? "string");
        const defaultStr = p.default !== undefined ? ` = ${JSON.stringify(p.default)}` : "";
        const requiredStr = p.required ? " (required)" : " (optional)";
        return `  - ${p.name}: ${typeStr}${defaultStr}${requiredStr}${p.description ? ` — ${p.description}` : ""}`;
      }).join("\n")
    : "  (none)";

  // Slots
  const slots = (componentIR.slots ?? []) as Array<Record<string, unknown>>;
  const slotsSection = slots.length > 0
    ? slots.map((s) => `  - ${s.name}${s.maxItems ? ` (max ${s.maxItems})` : ""}`).join("\n")
    : "  (none)";

  // Interaction states
  const states = (componentIR.states ?? []) as Array<Record<string, unknown>>;
  const statesSection = states.length > 0
    ? states.map((s) => `  - ${s.name}`).join("\n")
    : "  (none)";

  // A11y
  const a11y = (componentIR.a11y ?? {}) as Record<string, unknown>;
  const a11ySection = [
    a11y.role ? `  Role: ${a11y.role}` : null,
    a11y.focusable !== undefined ? `  Focusable: ${a11y.focusable}` : null,
    a11y.labelStrategy ? `  Label strategy: ${a11y.labelStrategy}` : null,
    ...(((a11y.notes ?? []) as string[]).map((n) => `  Note: ${n}`)),
  ].filter(Boolean).join("\n") || "  (none specified)";

  // Structure (simplified)
  const structure = componentIR.structure as Record<string, unknown> | undefined;
  const structureJson = structure
    ? JSON.stringify(simplifyNode(structure), null, 2)
    : "{}";

  // Tokens used by this component (filter to those referenced in the structure)
  const tokenEntries = tokens.map((t) => {
    const doc = t.doc ? (t.doc as Record<string, unknown>) : t;
    return {
      name: String(doc.name ?? t.name ?? "unknown"),
      type: String(doc.type ?? t.type ?? "unknown"),
      value: flattenTokenValue(doc.value ?? t.value),
    };
  });
  const tokensSection = tokenEntries.length > 0
    ? tokenEntries.map((t) => `  - ${t.name} (${t.type}): ${t.value}`).join("\n")
    : "  (none)";

  // Component library instructions
  let libraryInstructions = "";
  switch (componentLibrary) {
    case "shadcn":
      libraryInstructions = `
## Component library: shadcn/ui
- Build on top of shadcn/ui primitives where applicable (Button, Input, Dialog, etc.)
- Import from the project's components/ui directory: import { Button } from "@/components/ui/button"
- Use the cn() utility for class merging: import { cn } from "@/lib/utils"
- Follow shadcn/ui patterns for composition and styling`;
      break;
    case "radix":
      libraryInstructions = `
## Component library: Radix UI
- Use @radix-ui/react-* primitives for accessible interactive elements
- Wrap Radix primitives with custom styling using Tailwind classes
- Follow Radix composition patterns (Root, Trigger, Content, etc.)`;
      break;
    case "headless-ui":
      libraryInstructions = `
## Component library: Headless UI
- Use @headlessui/react primitives for accessible interactive elements
- Apply Tailwind styling via className props
- Use Headless UI's render prop pattern for state-driven styles`;
      break;
    default:
      libraryInstructions = `
## Component library: none (custom)
- Build all interactive behavior from scratch
- Ensure full keyboard navigation and ARIA support
- Use native HTML elements where possible`;
  }

  return `Generate a React + Tailwind CSS component from the following design system IR.

## Component: ${name}
- Slug: ${slug}
- Description: ${description}

## Variant axes
${variantsSection}

## Props
${propsSection}

## Slots
${slotsSection}

## Interaction states
${statesSection}

## Accessibility
${a11ySection}

## Component structure (simplified IR nodes)
\`\`\`json
${structureJson}
\`\`\`

## Design tokens
${tokensSection}
${libraryInstructions}

## Style approach
- Use Tailwind CSS utility classes
- Use CVA (class-variance-authority) for variant management
- Reference design tokens via CSS custom properties: var(--token-name) or Tailwind arbitrary values [var(--token-name)]
- Token CSS variable names: replace "/" with "-" in token names, prefix with "--"

## What to generate
Return a JSON object with:
1. "componentCode" — the full .tsx file for the component (React, TypeScript, Tailwind, CVA)
2. "storyCode" — a Storybook CSF3 story file (.stories.tsx) with stories for default + each variant
3. "typesCode" — a types file (.types.ts) exporting the component's prop interface
4. "tokenCSS" — CSS :root block with custom properties for all tokens used`;
}
