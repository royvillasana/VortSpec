import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { frameworkSchema } from "./setup";
import {
  buildFrameworkRulesDoc,
  linkFrameworkRulesInClaudeMd,
  pruneFrameworkConfigDoc,
  pruneReactArchitecture,
} from "./framework-docs";

/**
 * Transformations run against the REAL pinned `@royvillasana/sdd-de` docs.
 *
 * The other suite uses a hand-written stand-in, which only proves the parser handles shapes I
 * imagined — the same gap Honey named when her synthetic Figma tests passed while the live file
 * exposed a defect. These read what the toolkit actually ships, so a heading rename upstream
 * fails here rather than silently making the prune a no-op.
 */
const require_ = createRequire(import.meta.url);
let docsDir: string | null = null;
try {
  docsDir = join(dirname(require_.resolve("@royvillasana/sdd-de/package.json")), "docs");
} catch {
  docsDir = null;
}
const read = (name: string): string => readFileSync(join(docsDir!, name), "utf8");
const has = (name: string): boolean => !!docsDir && existsSync(join(docsDir, name));

// The toolkit is a dependency of the apps, not of this package, so it can legitimately be
// absent in a partial install. Skipping loudly beats a suite that silently proves nothing.
const d = docsDir && has("component-standards.md") ? describe : describe.skip;

d("the real toolkit docs (@royvillasana/sdd-de)", () => {
  it("still contains the React mandates this change exists to remove", () => {
    // If this ever fails, the toolkit fixed it upstream and the pruning may be obsolete —
    // which is worth knowing rather than silently pruning nothing.
    const cs = read("component-standards.md");
    expect(cs).toMatch(/CVA/);
    expect(cs).toMatch(/forwardRef/);
    expect(cs).toMatch(/## Style Encapsulation/);
  });

  it("removes the React architecture from component-standards.md for Vue", () => {
    const pruned = pruneReactArchitecture(read("component-standards.md"), "vue");
    expect(pruned).not.toMatch(/^##\s+Style Encapsulation/m);
    expect(pruned).not.toMatch(/forwardRef` is required on all components/);
    expect(pruned).toContain("framework-rules.md");
  });

  it("removes the CVA architecture from styling-best-practices.md for Svelte", () => {
    if (!has("styling-best-practices.md")) return;
    const pruned = pruneReactArchitecture(read("styling-best-practices.md"), "svelte");
    expect(pruned).not.toMatch(/^##\s+Component Variant Architecture/m);
    expect(pruned).toContain("framework-rules.md");
  });

  it("keeps the genuinely framework-neutral standards", () => {
    // Atomic design, states, a11y and the API rules apply whatever the framework — removing
    // them would trade one wrong instruction for a missing one.
    const pruned = pruneReactArchitecture(read("component-standards.md"), "angular");
    expect(pruned).toMatch(/## Atomic Design Hierarchy/);
    expect(pruned).toMatch(/## State Requirements/);
    expect(pruned).toMatch(/## Accessibility Baseline/);
    expect(pruned).toMatch(/## Variant Rules/);
  });

  it("leaves React and Next untouched — the sections are correct for them", () => {
    const cs = read("component-standards.md");
    expect(pruneReactArchitecture(cs, "react")).toBe(cs);
    expect(pruneReactArchitecture(cs, "next")).toBe(cs);
  });

  it("prunes the real framework-config.md to one framework's section", () => {
    if (!has("framework-config.md")) return;
    const pruned = pruneFrameworkConfigDoc(read("framework-config.md"), "svelte");
    expect(pruned).toMatch(/Svelte/);
    expect(pruned).not.toMatch(/^##\s+Angular/m);
    expect(pruned).not.toMatch(/^##\s+Astro/m);
    expect(pruned).not.toMatch(/^##\s+Nuxt/m);
  });

  it("links the generated rules into the real CLAUDE.md, above the docs it overrides", () => {
    const claudePath = join(dirname(require_.resolve("@royvillasana/sdd-de/package.json")), "CLAUDE.md");
    if (!existsSync(claudePath)) return;
    const linked = linkFrameworkRulesInClaudeMd(readFileSync(claudePath, "utf8"));
    expect(linked).toContain(".sdd-de/docs/framework-rules.md");
    // Must come BEFORE Component Standards, since it overrides it.
    expect(linked.indexOf("framework-rules.md")).toBeLessThan(linked.indexOf("- [Component Standards]"));
  });

  it("is idempotent — resync must not duplicate the link", () => {
    const claudePath = join(dirname(require_.resolve("@royvillasana/sdd-de/package.json")), "CLAUDE.md");
    if (!existsSync(claudePath)) return;
    const once = linkFrameworkRulesInClaudeMd(readFileSync(claudePath, "utf8"));
    expect(linkFrameworkRulesInClaudeMd(once)).toBe(once);
    expect(once.split(".sdd-de/docs/framework-rules.md").length - 1).toBe(1);
  });

  it("produces reachable, non-contradictory rules for every framework", () => {
    for (const f of frameworkSchema.options) {
      const rules = buildFrameworkRulesDoc(f);
      const cs = pruneReactArchitecture(read("component-standards.md"), f);
      expect(rules, `${f}: no rules`).toBeTruthy();
      // For non-React, the mandate is gone from the standards AND stated in the rules.
      if (f !== "react" && f !== "next") {
        expect(cs, `${f}: React architecture survived`).not.toMatch(/^##\s+Style Encapsulation/m);
      }
    }
  });
});
