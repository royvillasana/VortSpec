import { describe, it, expect } from "vitest";
import { runStructureInferenceCore } from "../stages/structure-inference";
import { runStyleMiningCore } from "../stages/style-mining";
import { ComponentIRSchema } from "@vortspec/ir";

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

describe("Structure Inference -- minimal fixture", () => {
  const files = [
    { path: "index.html", content: MINIMAL_HTML },
    { path: "styles.css", content: MINIMAL_CSS },
  ];
  const styleResult = runStyleMiningCore(files);

  it("finds component candidates", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.components.length).toBeGreaterThan(0);
  });

  it("detects the btn pattern as a component candidate", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    // .btn appears 2 times with the same child structure (span.btn-label)
    const btnComp = result.components.find(
      (c) => c.structure.name === "btn" || c.name.includes("component-candidate"),
    );
    expect(btnComp).toBeDefined();
  });

  it("detects variant axes from secondary classes", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    // The btn component should have variant axes from btn-primary vs btn-secondary
    const btnComp = result.components[0];
    expect(btnComp.variantAxes.length).toBeGreaterThan(0);
    // Should have variant options for each secondary class
    const axis = btnComp.variantAxes[0];
    expect(axis.options.length).toBeGreaterThanOrEqual(2);
  });

  it("detects hover interaction state", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    const btnComp = result.components[0];
    const hoverState = btnComp.states.find((s) => s.name === "hover");
    expect(hoverState).toBeDefined();
    expect(hoverState!.nodeOverrides.length).toBeGreaterThan(0);
  });

  it("has correct component status", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    for (const comp of result.components) {
      expect(comp.status).toBe("imported");
    }
  });

  it("builds IRNode tree with children", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    const btnComp = result.components[0];
    // btn has at least one child (the span.btn-label)
    expect(btnComp.structure.children).toBeDefined();
    expect(btnComp.structure.children!.length).toBeGreaterThan(0);
  });

  it("all styles are flagged literals", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    for (const comp of result.components) {
      function checkNode(node: typeof comp.structure) {
        if (node.styles) {
          for (const sv of Object.values(node.styles)) {
            if (!sv) continue;
            expect(sv.kind).toBe("literal");
            if (sv.kind === "literal") {
              expect(sv.flagged).toBe(true);
            }
          }
        }
        if (node.children) {
          for (const child of node.children) {
            checkNode(child);
          }
        }
      }
      checkNode(comp.structure);
    }
  });

  it("validates against ComponentIRSchema", () => {
    const result = runStructureInferenceCore(files, styleResult.groups);
    for (const comp of result.components) {
      const parsed = ComponentIRSchema.safeParse(comp);
      if (!parsed.success) {
        console.error("Validation errors:", JSON.stringify(parsed.error.issues, null, 2));
      }
      expect(parsed.success).toBe(true);
    }
  });
});

describe("Structure Inference -- edge cases", () => {
  it("returns no components for HTML with unique elements", () => {
    const html = `<html><body>
      <div class="unique-a"><span>one</span></div>
      <div class="unique-b"><span>two</span></div>
    </body></html>`;
    const files = [{ path: "unique.html", content: html }];
    const styleResult = runStyleMiningCore(files);
    const result = runStructureInferenceCore(files, styleResult.groups);
    // No repeated primary classes, so no candidates
    expect(result.components.length).toBe(0);
  });

  it("handles HTML with no class attributes", () => {
    const html = `<html><body><div><p>hello</p></div></body></html>`;
    const files = [{ path: "noclass.html", content: html }];
    const styleResult = runStyleMiningCore(files);
    const result = runStructureInferenceCore(files, styleResult.groups);
    expect(result.components.length).toBe(0);
  });
});
