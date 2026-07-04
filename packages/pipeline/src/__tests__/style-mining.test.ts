import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { runStyleMiningCore } from "../stages/style-mining";

// Use the same HTML/CSS as the minimal fixture
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

describe("Style Mining -- minimal fixture", () => {
  const files = [
    { path: "index.html", content: MINIMAL_HTML },
    { path: "styles.css", content: MINIMAL_CSS },
  ];

  it("extracts all CSS declarations", () => {
    const result = runStyleMiningCore(files);
    expect(result.totalDeclarations).toBeGreaterThan(0);
    // .btn has 10 declarations, .btn-primary 2, :hover 1, .btn-secondary 3, .btn-label 1 = 17
    expect(result.totalDeclarations).toBe(17);
  });

  it("groups unique (property, value) pairs", () => {
    const result = runStyleMiningCore(files);
    // Most values appear only once, but some may share (e.g. "border: none" in .btn)
    expect(result.uniqueValues).toBeGreaterThan(0);
    expect(result.uniqueValues).toBeLessThanOrEqual(result.totalDeclarations);
  });

  it("sorts groups by usage count descending", () => {
    const result = runStyleMiningCore(files);
    for (let i = 1; i < result.groups.length; i++) {
      expect(result.groups[i - 1].usageCount).toBeGreaterThanOrEqual(
        result.groups[i].usageCount,
      );
    }
  });

  it("correctly identifies specific values", () => {
    const result = runStyleMiningCore(files);
    const bgBlue = result.groups.find(
      (g) => g.property === "background-color" && g.value === "#2563EB",
    );
    expect(bgBlue).toBeDefined();
    expect(bgBlue!.usageCount).toBe(1);
  });
});

describe("Style Mining -- Claude Design export", () => {
  it("processes without errors and produces groups", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const zipPath = path.join(
      __dirname,
      "../__fixtures__/claude-design-export.zip",
    );

    // Skip if fixture doesn't exist
    if (!fs.existsSync(zipPath)) {
      return;
    }

    const zipBuffer = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(zipBuffer);

    const files: Array<{ path: string; content: string }> = [];
    for (const [filePath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lower = filePath.toLowerCase();
      if (
        lower.endsWith(".css") ||
        lower.endsWith(".html") ||
        lower.endsWith(".htm")
      ) {
        files.push({ path: filePath, content: await entry.async("text") });
      }
    }

    const result = runStyleMiningCore(files);
    expect(result.totalDeclarations).toBeGreaterThan(100);
    expect(result.groups.length).toBeGreaterThan(50);

    // Snapshot the summary
    expect({
      groupCount: result.groups.length,
      totalDeclarations: result.totalDeclarations,
      top10: result.groups.slice(0, 10).map((g) => ({
        property: g.property,
        value: g.value,
        count: g.usageCount,
      })),
    }).toMatchSnapshot();
  });
});

describe("Style Mining -- edge cases", () => {
  it("handles empty CSS", () => {
    const result = runStyleMiningCore([{ path: "empty.css", content: "" }]);
    expect(result.totalDeclarations).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it("handles HTML with inline styles only", () => {
    const html = `<div style="color: red; font-size: 14px;">hello</div>`;
    const result = runStyleMiningCore([
      { path: "inline.html", content: html },
    ]);
    expect(result.totalDeclarations).toBe(2);
  });
});
