"use client";

/**
 * Renders an IRNode tree as actual HTML/CSS using the styles stored in the IR.
 * This is the "IR Renderer" from the PRD — pure function from IR to visual output.
 */

interface IRNodeData {
  id?: string;
  type?: string;
  name?: string;
  layout?: Record<string, unknown>;
  styles?: Record<string, { kind: string; value?: string | number; tokenId?: string }>;
  text?: { content?: string; bindToProp?: string };
  children?: IRNodeData[];
}

function irStyleToCSS(styles: Record<string, { kind: string; value?: string | number; tokenId?: string }>): React.CSSProperties {
  const css: Record<string, string | number> = {};

  for (const [prop, sv] of Object.entries(styles)) {
    if (!sv || sv.kind !== "literal") continue;
    const val = String(sv.value ?? "");
    if (!val) continue;

    switch (prop) {
      case "background":
        css.backgroundColor = val;
        break;
      case "color":
        css.color = val;
        break;
      case "borderColor":
        css.borderColor = val;
        break;
      case "borderWidth":
        css.borderWidth = val;
        break;
      case "borderStyle":
        css.borderStyle = val;
        break;
      case "radius":
        css.borderRadius = val;
        break;
      case "shadow":
        css.boxShadow = val;
        break;
      case "opacity":
        css.opacity = Number(val) || 1;
        break;
      case "width":
        css.width = val;
        break;
      case "height":
        css.height = val;
        break;
      case "minWidth":
        css.minWidth = val;
        break;
      case "maxWidth":
        css.maxWidth = val;
        break;
      case "minHeight":
        css.minHeight = val;
        break;
      case "maxHeight":
        css.maxHeight = val;
        break;
      case "overflow":
        css.overflow = val;
        break;
      case "typography": {
        // Typography is stored as aggregated "font-size: 14px; font-weight: 500" etc.
        const pairs = val.split(";").map((s) => s.trim()).filter(Boolean);
        for (const pair of pairs) {
          const [p, v] = pair.split(":").map((s) => s.trim());
          if (!p || !v) continue;
          const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          css[camel] = v;
        }
        break;
      }
    }
  }

  return css as React.CSSProperties;
}

function irLayoutToCSS(layout: Record<string, unknown>): React.CSSProperties {
  const css: Record<string, string | number> = {};

  if (layout.mode === "flex") {
    css.display = "flex";
    css.flexDirection = layout.direction === "column" ? "column" : "row";
    if (layout.align) {
      const alignMap: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", stretch: "stretch", baseline: "baseline" };
      css.alignItems = alignMap[layout.align as string] ?? (layout.align as string);
    }
    if (layout.justify) {
      const justifyMap: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", between: "space-between", around: "space-around" };
      css.justifyContent = justifyMap[layout.justify as string] ?? (layout.justify as string);
    }
    if (layout.gap) {
      const gap = layout.gap as { kind: string; value?: string | number };
      if (gap.kind === "literal") css.gap = String(gap.value ?? "");
    }
    if (layout.wrap) css.flexWrap = "wrap";
  } else if (layout.mode === "grid") {
    css.display = "grid";
  }

  return css as React.CSSProperties;
}

function IRNodeRenderer({ node, depth = 0 }: { node: IRNodeData; depth?: number }) {
  if (depth > 10) return null; // safety cap

  const style: React.CSSProperties = {
    ...(node.layout ? irLayoutToCSS(node.layout) : {}),
    ...(node.styles ? irStyleToCSS(node.styles) : {}),
  };

  const children = node.children?.map((child, i) => (
    <IRNodeRenderer key={child.id ?? i} node={child} depth={depth + 1} />
  ));

  // Text nodes render their content
  if (node.type === "text" && node.text?.content) {
    return <span style={style}>{node.text.content}</span>;
  }

  // Image/icon nodes
  if (node.type === "image") {
    return <span style={{ ...style, display: "inline-block", width: style.width ?? 16, height: style.height ?? 16, background: "#6B7280", borderRadius: 2 }} />;
  }

  return <div style={style}>{children}</div>;
}

export function IRPreview({ structure }: { structure: Record<string, unknown> }) {
  return (
    <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
      <div style={{ transform: "scale(0.9)", transformOrigin: "center center" }}>
        <IRNodeRenderer node={structure as IRNodeData} />
      </div>
    </div>
  );
}
