import JSZip from "jszip";
import { extractStylesFromCSS, extractInlineStyles, extractEmbeddedCSS, type CSSDeclaration } from "../lib/css-parser";
import { createClient } from "@supabase/supabase-js";

export interface StyleGroup {
  property: string;
  value: string;
  usageCount: number;
  locations: string[];
}

export interface StyleMiningResult {
  groups: StyleGroup[];
  totalDeclarations: number;
  uniqueValues: number;
}

/**
 * Core style mining logic -- pure function, no Supabase.
 * Takes pre-extracted file contents, returns grouped style values.
 */
export function runStyleMiningCore(
  files: Array<{ path: string; content: string }>
): StyleMiningResult {
  const allDecls: CSSDeclaration[] = [];

  for (const file of files) {
    const lower = file.path.toLowerCase();

    if (lower.endsWith(".css")) {
      // CSS file: extract all declarations
      allDecls.push(...extractStylesFromCSS(file.content, file.path));
    } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      // HTML file: extract embedded <style> CSS + inline styles
      const embeddedCSS = extractEmbeddedCSS(file.content);
      for (const css of embeddedCSS) {
        allDecls.push(...extractStylesFromCSS(css, `${file.path}:<style>`));
      }
      allDecls.push(...extractInlineStyles(file.content, file.path));
    }
  }

  // Group by exact (property, value) pair
  const groupMap = new Map<string, StyleGroup>();
  for (const decl of allDecls) {
    const key = `${decl.property}::${decl.value}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.usageCount++;
      existing.locations.push(decl.selector);
    } else {
      groupMap.set(key, {
        property: decl.property,
        value: decl.value,
        usageCount: 1,
        locations: [decl.selector],
      });
    }
  }

  const groups = [...groupMap.values()].sort((a, b) => b.usageCount - a.usageCount);

  return {
    groups,
    totalDeclarations: allDecls.length,
    uniqueValues: groups.length,
  };
}

/**
 * Wired version: downloads ZIP from Supabase Storage, extracts files, runs core.
 */
export async function runStyleMiningStage(storagePath: string): Promise<StyleMiningResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: blob, error } = await supabase.storage.from("imports").download(storagePath);
  if (error || !blob) throw new Error(`Download failed: ${error?.message}`);

  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const files: Array<{ path: string; content: string }> = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith(".css") || lower.endsWith(".html") || lower.endsWith(".htm")) {
      files.push({ path, content: await entry.async("text") });
    }
  }

  return runStyleMiningCore(files);
}
