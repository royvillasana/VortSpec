import { describe, expect, it } from "vitest";
import { frameworkSchema } from "./setup";
import { buildFrameworkRulesDoc, pruneFrameworkConfigDoc, FRAMEWORK_RULES_PATH } from "./framework-docs";

const FRAMEWORKS = frameworkSchema.options;

/** A stand-in with the shape the toolkit's framework-config.md actually has. */
const CONFIG_DOC = [
  "# Framework Configuration",
  "",
  "Read `.sdd-de/project.yaml` first.",
  "",
  "---",
  "",
  "## React (Vite / CRA)",
  "",
  "```tsx",
  "// # not a heading — inside a fence",
  "export function Button() {}",
  "```",
  "",
  "**Variant management**: CVA in a colocated `.variants.ts`.",
  "",
  "---",
  "",
  "## Vue 3 (Vite)",
  "",
  "`defineProps` and `<style scoped>`.",
  "",
  "---",
  "",
  "## Angular",
  "",
  "`@Input()` and `(click)`.",
  "",
  "---",
  "",
  "## Vanilla HTML / CSS / JS",
  "",
  "Plain partials.",
  "",
  "---",
  "",
  "## Styling: SCSS / Sass",
  "",
  "Shared — applies whatever the framework.",
  "",
  "---",
  "",
  "## Design Token File — Default Locations",
  "",
  "A table for every framework.",
].join("\n");

describe("buildFrameworkRulesDoc", () => {
  it("generates rules for every framework the app offers", () => {
    for (const f of FRAMEWORKS) {
      const doc = buildFrameworkRulesDoc(f);
      expect(doc, `no rules doc for ${f}`).toBeTruthy();
      expect(doc).toContain("# Framework Rules");
      expect(doc).toContain(`\`framework: ${f}\``);
    }
  });

  it("states that it wins over the React-shaped shared standards", () => {
    // This is the whole point: the toolkit docs are still on disk, so the generated file has
    // to say which one governs — and then the prune keeps the worst of them out of context.
    const doc = buildFrameworkRulesDoc("svelte");
    expect(doc).toContain("THIS FILE WINS");
    expect(doc).toContain("component-standards.md");
  });

  it("carries the framework's own idioms, not React's", () => {
    expect(buildFrameworkRulesDoc("vue")).toContain("defineProps");
    expect(buildFrameworkRulesDoc("angular")).toContain("(click)");
    expect(buildFrameworkRulesDoc("svelte")).toContain("$props()");
    expect(buildFrameworkRulesDoc("svelte")).not.toContain("forwardRef` ONLY if");
  });

  it("keeps every rule on a single table row", () => {
    // A raw newline inside a cell silently breaks the table; a raw pipe splits the row.
    for (const f of FRAMEWORKS) {
      for (const row of buildFrameworkRulesDoc(f).split("\n").filter((l) => l.startsWith("| "))) {
        expect(row.split(/(?<!\\)\|/).length, `${f}: row has an unescaped pipe — ${row}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("never tells a React-family project that it is not React", () => {
    // The shipped version emitted one unconditional paragraph, so React's own rules read
    // "React (Vite) is not React" and Next's read "Next.js (App Router) is not React".
    // For the other seven the same sentence is true and useful, so this is scoped to the
    // family where it is false — asserting it everywhere was my own bad assertion.
    for (const f of ["react", "next"]) {
      const doc = buildFrameworkRulesDoc(f);
      expect(doc, `${f} claims it is not React`).not.toMatch(/is not React/);
    }
  });

  it("tells React and Next the shared standards still APPLY, not that they are overridden", () => {
    // pruneReactArchitecture() deliberately keeps those docs intact for the React family, so
    // claiming to override them would contradict the transformation the same module performs.
    for (const f of ["react", "next"]) {
      const doc = buildFrameworkRulesDoc(f);
      expect(doc).toMatch(/IS this project's architecture/);
      expect(doc).toMatch(/still apply/);
      expect(doc, `${f} claims to override standards it keeps`).not.toContain("THIS FILE WINS");
    }
  });

  it("tells the other seven the shared standards are overridden and removed", () => {
    for (const f of FRAMEWORKS.filter((x) => x !== "react" && x !== "next")) {
      const doc = buildFrameworkRulesDoc(f);
      expect(doc).toContain("THIS FILE WINS");
      expect(doc).toMatch(/is not React/);
      expect(doc).toMatch(/removes the React-only/);
    }
  });

  it("returns empty for an unknown framework rather than inventing rules", () => {
    expect(buildFrameworkRulesDoc("brand-new-framework")).toBe("");
    expect(buildFrameworkRulesDoc("")).toBe("");
  });

  it("writes where the toolkit's other docs live", () => {
    expect(FRAMEWORK_RULES_PATH).toBe(".sdd-de/docs/framework-rules.md");
  });
});

describe("pruneFrameworkConfigDoc — the wrong frameworks never reach the context", () => {
  it("keeps the active framework's section and drops the others", () => {
    const pruned = pruneFrameworkConfigDoc(CONFIG_DOC, "vue");
    expect(pruned).toContain("## Vue 3 (Vite)");
    expect(pruned).toContain("defineProps");
    expect(pruned).not.toContain("## React (Vite / CRA)");
    expect(pruned).not.toContain("## Angular");
    expect(pruned).not.toContain("## Vanilla HTML / CSS / JS");
  });

  it("drops React's CVA guidance from a non-React project", () => {
    // The specific sentence a Vue build was reading and could act on.
    expect(pruneFrameworkConfigDoc(CONFIG_DOC, "angular")).not.toContain("CVA in a colocated");
  });

  it("keeps shared sections, which apply whatever the framework is", () => {
    const pruned = pruneFrameworkConfigDoc(CONFIG_DOC, "vue");
    expect(pruned).toContain("## Styling: SCSS / Sass");
    expect(pruned).toContain("## Design Token File — Default Locations");
    expect(pruned).toContain("Read `.sdd-de/project.yaml` first.");
  });

  it("gives sveltekit the Svelte section", () => {
    const doc = "## Svelte / SvelteKit\n\nrunes\n\n---\n\n## Angular\n\ninputs\n";
    expect(pruneFrameworkConfigDoc(doc, "sveltekit")).toContain("runes");
    expect(pruneFrameworkConfigDoc(doc, "sveltekit")).not.toContain("inputs");
  });

  it("does not treat a '#' inside a fenced code block as a heading", () => {
    // React's section contains a fenced snippet with a `#` comment; reading that as a heading
    // would end the section early and leak the rest of the doc through.
    const pruned = pruneFrameworkConfigDoc(CONFIG_DOC, "react");
    expect(pruned).toContain("not a heading — inside a fence");
    expect(pruned).not.toContain("## Vue 3 (Vite)");
  });

  it("returns the document untouched for an unknown framework", () => {
    // Pruning to nothing would be worse than leaving it; generation is already STOPped.
    expect(pruneFrameworkConfigDoc(CONFIG_DOC, "brand-new-framework")).toBe(CONFIG_DOC);
    expect(pruneFrameworkConfigDoc(CONFIG_DOC, undefined)).toBe(CONFIG_DOC);
  });

  it("keeps an unrecognized heading rather than dropping it", () => {
    // Safe failure: if the toolkit renames a section, it reads as shared and survives.
    const doc = "## React (Vite / CRA)\n\nreact\n\n---\n\n## Something New\n\nkeep me\n";
    const pruned = pruneFrameworkConfigDoc(doc, "vue");
    expect(pruned).toContain("keep me");
  });

  it("leaves every framework with a non-empty document", () => {
    for (const f of FRAMEWORKS) {
      expect(pruneFrameworkConfigDoc(CONFIG_DOC, f).trim().length, `${f} pruned to nothing`).toBeGreaterThan(0);
    }
  });
});
