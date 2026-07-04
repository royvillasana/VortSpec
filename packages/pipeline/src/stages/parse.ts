import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

export interface ParseResult {
  htmlFiles: number;
  cssFiles: number;
  nodeCount: number;
  stylesheetCount: number;
  fileList: string[];
  caption: string;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Count HTML elements in a string (simple regex, no DOM) */
function countNodes(html: string): number {
  const openTags = html.match(/<[a-zA-Z][a-zA-Z0-9]*/g);
  return openTags?.length ?? 0;
}

/** Count CSS rule blocks */
function countRules(css: string): number {
  const blocks = css.match(/\{[^}]*\}/g);
  return blocks?.length ?? 0;
}

export async function runParseStage(storagePath: string): Promise<ParseResult> {
  const supabase = getSupabase();

  // Download ZIP from storage
  const { data: blob, error } = await supabase.storage
    .from("imports")
    .download(storagePath);

  if (error || !blob) {
    throw new Error(`Failed to download ZIP: ${error?.message ?? "not found"}`);
  }

  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const htmlFiles: string[] = [];
  const cssFiles: string[] = [];
  let totalNodes = 0;
  let totalRules = 0;

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = path.toLowerCase();

    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      htmlFiles.push(path);
      const content = await entry.async("text");
      totalNodes += countNodes(content);
    } else if (lower.endsWith(".css")) {
      cssFiles.push(path);
      const content = await entry.async("text");
      totalRules += countRules(content);
    }
  }

  if (htmlFiles.length === 0 && cssFiles.length === 0) {
    throw new Error("No HTML or CSS files found in the uploaded ZIP");
  }

  const caption =
    `Found ${htmlFiles.length} HTML file${htmlFiles.length !== 1 ? "s" : ""}, ` +
    `${cssFiles.length} CSS file${cssFiles.length !== 1 ? "s" : ""}, ` +
    `${totalNodes} elements, ${totalRules} CSS rules`;

  return {
    htmlFiles: htmlFiles.length,
    cssFiles: cssFiles.length,
    nodeCount: totalNodes,
    stylesheetCount: totalRules,
    fileList: [...htmlFiles, ...cssFiles],
    caption,
  };
}
