import * as csstree from "css-tree";
import { load } from "cheerio";

export interface CSSDeclaration {
  selector: string;
  property: string;
  value: string;
}

/**
 * Extract all declarations from a CSS string.
 * Returns (selector, property, value) triples.
 */
export function extractStylesFromCSS(css: string, sourceFile?: string): CSSDeclaration[] {
  const results: CSSDeclaration[] = [];

  try {
    const ast = csstree.parse(css, { positions: false });

    csstree.walk(ast, {
      visit: "Rule",
      enter(rule) {
        if (rule.type !== "Rule" || !rule.prelude || !rule.block) return;

        const selector = csstree.generate(rule.prelude);

        if (rule.block.children) {
          rule.block.children.forEach((decl) => {
            if (decl.type === "Declaration") {
              const value = csstree.generate(decl.value);
              results.push({
                selector: sourceFile ? `${sourceFile}::${selector}` : selector,
                property: decl.property,
                value: value.trim(),
              });
            }
          });
        }
      },
    });
  } catch {
    // Gracefully handle unparseable CSS
  }

  return results;
}

/**
 * Extract inline styles from HTML elements.
 */
export function extractInlineStyles(html: string, sourceFile?: string): CSSDeclaration[] {
  const results: CSSDeclaration[] = [];
  const $ = load(html);

  $("[style]").each((i, el) => {
    const styleAttr = $(el).attr("style");
    if (!styleAttr) return;

    const tag = $(el).prop("tagName")?.toLowerCase() ?? "unknown";
    const elRef = sourceFile ? `${sourceFile}::${tag}[${i}]` : `${tag}[${i}]`;

    // Parse inline styles as declarations
    const pairs = styleAttr.split(";").filter((s) => s.trim());
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx < 0) continue;
      const property = pair.slice(0, colonIdx).trim();
      const value = pair.slice(colonIdx + 1).trim();
      if (property && value) {
        results.push({ selector: `inline:${elRef}`, property, value });
      }
    }
  });

  return results;
}

/**
 * Extract CSS from <style> tags in HTML.
 */
export function extractEmbeddedCSS(html: string): string[] {
  const $ = load(html);
  const styles: string[] = [];
  $("style").each((_, el) => {
    const text = $(el).text();
    if (text.trim()) styles.push(text);
  });
  return styles;
}
