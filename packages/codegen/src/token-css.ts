/**
 * Generate CSS custom properties from DesignToken[] (as JSON from the database).
 */

function tokenNameToCSS(name: string): string {
  return "--" + name.replace(/\//g, "-").replace(/\s+/g, "-").toLowerCase();
}

function flattenTokenValue(tokenValue: unknown): string {
  if (!tokenValue || typeof tokenValue !== "object") return String(tokenValue ?? "");
  const v = tokenValue as Record<string, unknown>;
  const type = v.type as string | undefined;
  const inner = v.value;

  if (typeof inner === "number") {
    // opacity or zIndex — raw number
    if (type === "zIndex") return String(inner);
    return String(inner);
  }
  if (typeof inner === "string") return inner;

  if (typeof inner === "object" && inner !== null) {
    const obj = inner as Record<string, unknown>;

    // ColorValue: { hex, alpha? }
    if ("hex" in obj) {
      const hex = String(obj.hex);
      if (obj.alpha !== undefined && obj.alpha !== 1) {
        // Convert to rgba
        const alpha = Number(obj.alpha);
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return hex;
    }

    // DimensionValue: { value, unit }
    if ("value" in obj && "unit" in obj) {
      return `${obj.value}${obj.unit}`;
    }

    // TypographyValue — expand to multiple properties (return font shorthand)
    if ("fontFamily" in obj) {
      const fontSize = obj.fontSize as Record<string, unknown> | undefined;
      const fontWeight = obj.fontWeight as number | undefined;
      const lineHeight = obj.lineHeight as Record<string, unknown> | number | undefined;
      let lh = "";
      if (typeof lineHeight === "number") {
        lh = String(lineHeight);
      } else if (lineHeight && typeof lineHeight === "object") {
        lh = `${(lineHeight as Record<string, unknown>).value}${(lineHeight as Record<string, unknown>).unit}`;
      }
      const size = fontSize ? `${fontSize.value}${fontSize.unit}` : "16px";
      return `${fontWeight ?? 400} ${size}${lh ? `/${lh}` : ""} ${obj.fontFamily}`;
    }

    // ShadowValue: { layers: [...] }
    if ("layers" in obj) {
      const layers = obj.layers as Array<Record<string, unknown>>;
      return layers.map((layer) => {
        const colorRef = layer.colorRef as Record<string, unknown> | string;
        let color = "rgba(0,0,0,0.1)";
        if (typeof colorRef === "object" && colorRef !== null && "hex" in colorRef) {
          color = String(colorRef.hex);
        }
        const inset = layer.inset ? "inset " : "";
        return `${inset}${layer.x}px ${layer.y}px ${layer.blur}px ${layer.spread}px ${color}`;
      }).join(", ");
    }

    // BorderValue: { width, style, colorRef }
    if ("width" in obj && "style" in obj) {
      const w = obj.width as Record<string, unknown>;
      return `${w?.value ?? 1}${w?.unit ?? "px"} ${obj.style}`;
    }

    // MotionValue: { duration, easing }
    if ("duration" in obj) {
      return `${obj.duration}ms ${obj.easing ?? "ease"}`;
    }
  }

  return JSON.stringify(inner);
}

export function generateTokenCSS(tokens: unknown[]): string {
  if (!tokens || tokens.length === 0) {
    return ":root {\n  /* No tokens */\n}\n";
  }

  const lines: string[] = [];

  for (const token of tokens) {
    if (!token || typeof token !== "object") continue;
    const t = token as Record<string, unknown>;

    // Tokens from DB may be wrapped in a `doc` field
    const doc = (t.doc ? t.doc : t) as Record<string, unknown>;
    const name = String(doc.name ?? t.name ?? "unknown");
    const cssVar = tokenNameToCSS(name);
    const cssValue = flattenTokenValue(doc.value ?? t.value);

    lines.push(`  ${cssVar}: ${cssValue};`);
  }

  return `:root {\n${lines.join("\n")}\n}\n`;
}
