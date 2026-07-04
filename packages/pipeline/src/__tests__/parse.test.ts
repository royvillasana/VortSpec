import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";

// Import the pure parsing logic — we test it without Supabase by feeding buffers directly
// We can't import runParseStage directly as it depends on Supabase,
// so we extract the core logic into testable functions.

/** Count HTML elements in a string (same logic as parse.ts) */
function countNodes(html: string): number {
  const openTags = html.match(/<[a-zA-Z][a-zA-Z0-9]*/g);
  return openTags?.length ?? 0;
}

/** Count CSS rule blocks */
function countRules(css: string): number {
  const blocks = css.match(/\{[^}]*\}/g);
  return blocks?.length ?? 0;
}

/** Core parse logic extracted for testing */
async function parseZipBuffer(buffer: ArrayBuffer) {
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

  return {
    htmlFiles: htmlFiles.length,
    cssFiles: cssFiles.length,
    nodeCount: totalNodes,
    stylesheetCount: totalRules,
    fileList: [...htmlFiles, ...cssFiles],
    caption:
      `Found ${htmlFiles.length} HTML file${htmlFiles.length !== 1 ? "s" : ""}, ` +
      `${cssFiles.length} CSS file${cssFiles.length !== 1 ? "s" : ""}, ` +
      `${totalNodes} elements, ${totalRules} CSS rules`,
  };
}

// Minimal button fixture data — same content as create-minimal-zip.ts
const MINIMAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="component-group">
    <button class="btn btn-primary">
      <span class="btn-label">Continue</span>
    </button>
    <button class="btn btn-secondary">
      <span class="btn-label">Cancel</span>
    </button>
  </div>
</body>
</html>`;

const MINIMAL_CSS = `.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-family: 'Geist', sans-serif;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #2563EB;
  color: #FFFFFF;
}

.btn-primary:hover {
  background-color: #1D4ED8;
}

.btn-secondary {
  background-color: transparent;
  color: #E7E9EC;
  border: 1px solid #34373D;
}

.btn-label {
  line-height: 1;
}`;

let minimalZipBuffer: ArrayBuffer;

beforeAll(async () => {
  const zip = new JSZip();
  zip.file("index.html", MINIMAL_HTML);
  zip.file("styles.css", MINIMAL_CSS);
  const buf = await zip.generateAsync({ type: "arraybuffer" });
  minimalZipBuffer = buf;
});

describe("Parse stage — minimal-button fixture", () => {
  it("finds 1 HTML file and 1 CSS file", async () => {
    const result = await parseZipBuffer(minimalZipBuffer);
    expect(result.htmlFiles).toBe(1);
    expect(result.cssFiles).toBe(1);
  });

  it("counts nodes correctly", async () => {
    const result = await parseZipBuffer(minimalZipBuffer);
    // html, head, meta, link, body, div, button, span, button, span = 10
    expect(result.nodeCount).toBe(10);
  });

  it("counts CSS rules correctly", async () => {
    const result = await parseZipBuffer(minimalZipBuffer);
    // .btn, .btn-primary, .btn-primary:hover, .btn-secondary, .btn-label = 5
    expect(result.stylesheetCount).toBe(5);
  });

  it("produces a caption with correct format", async () => {
    const result = await parseZipBuffer(minimalZipBuffer);
    expect(result.caption).toMatch(/^Found 1 HTML file, 1 CSS file, \d+ elements, \d+ CSS rules$/);
  });

  it("lists files in the fileList", async () => {
    const result = await parseZipBuffer(minimalZipBuffer);
    expect(result.fileList).toContain("index.html");
    expect(result.fileList).toContain("styles.css");
  });
});

describe("Parse stage — error cases", () => {
  it("rejects a ZIP with no HTML or CSS", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "no HTML here");
    const buf = await zip.generateAsync({ type: "arraybuffer" });

    await expect(parseZipBuffer(buf)).rejects.toThrow(
      "No HTML or CSS files found",
    );
  });

  it("rejects invalid data (not a ZIP)", async () => {
    const buf = new TextEncoder().encode("this is not a zip").buffer;
    await expect(parseZipBuffer(buf)).rejects.toThrow();
  });

  it("handles an empty ZIP", async () => {
    const zip = new JSZip();
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    await expect(parseZipBuffer(buf)).rejects.toThrow(
      "No HTML or CSS files found",
    );
  });
});
