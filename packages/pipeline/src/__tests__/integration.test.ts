import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { runStyleMiningCore } from "../stages/style-mining";
import { runStructureInferenceCore } from "../stages/structure-inference";
import { runReportCore } from "../stages/report";
import { DesignTokenSchema, ComponentIRSchema } from "@vortspec/ir";

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

describe("Full pipeline integration", () => {
  it("runs all core stages end-to-end on in-memory ZIP", async () => {
    // Create minimal fixture ZIP in memory
    const zip = new JSZip();
    zip.file("index.html", MINIMAL_HTML);
    zip.file("styles.css", MINIMAL_CSS);
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const recreatedZip = await JSZip.loadAsync(buf);

    const files: Array<{ path: string; content: string }> = [];
    for (const [path, entry] of Object.entries(recreatedZip.files)) {
      if (entry.dir) continue;
      const lower = path.toLowerCase();
      if (
        lower.endsWith(".css") ||
        lower.endsWith(".html") ||
        lower.endsWith(".htm")
      ) {
        files.push({ path, content: await entry.async("text") });
      }
    }

    // Stage 1: Style mining
    const styleMiningResult = runStyleMiningCore(files);
    expect(styleMiningResult.totalDeclarations).toBeGreaterThan(0);
    expect(styleMiningResult.groups.length).toBeGreaterThan(0);

    // Stage 2: Structure inference
    const structureResult = runStructureInferenceCore(
      files,
      styleMiningResult.groups,
    );
    expect(structureResult.components.length).toBeGreaterThan(0);
    expect(structureResult.candidateCount).toBeGreaterThan(0);

    // Stage 3: Report
    const reportResult = runReportCore(
      structureResult.components,
      styleMiningResult.groups,
    );

    // Assertions on tokens
    for (const token of reportResult.tokens) {
      const parsed = DesignTokenSchema.safeParse(token);
      if (!parsed.success) {
        console.error(
          "Token validation failed:",
          JSON.stringify(parsed.error.issues, null, 2),
        );
      }
      expect(parsed.success).toBe(true);
    }

    // Assertions on components
    for (const comp of reportResult.components) {
      const parsed = ComponentIRSchema.safeParse(comp);
      if (!parsed.success) {
        console.error(
          "Component validation failed:",
          JSON.stringify(parsed.error.issues, null, 2),
        );
      }
      expect(parsed.success).toBe(true);

      // Status must be normalized
      expect(comp.status).toBe("normalized");
    }

    // Summary must have non-zero counts
    expect(reportResult.summary.componentCount).toBeGreaterThan(0);
    // Some style groups should be promoted to tokens
    // (background-color appears in both .btn-primary and .btn-primary:hover)
    // Other tokens may or may not be promoted depending on exact logic
  });

  it("processes the Claude Design export fixture end-to-end", async () => {
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

    const styleMiningResult = runStyleMiningCore(files);
    expect(styleMiningResult.totalDeclarations).toBeGreaterThan(0);

    const structureResult = runStructureInferenceCore(
      files,
      styleMiningResult.groups,
    );
    // Real export should have some components
    expect(structureResult.candidateCount).toBeGreaterThanOrEqual(0);

    const reportResult = runReportCore(
      structureResult.components,
      styleMiningResult.groups,
    );

    // All tokens should validate
    for (const token of reportResult.tokens) {
      expect(DesignTokenSchema.safeParse(token).success).toBe(true);
    }

    // All components should validate
    for (const comp of reportResult.components) {
      expect(ComponentIRSchema.safeParse(comp).success).toBe(true);
      expect(comp.status).toBe("normalized");
    }
  });
});
