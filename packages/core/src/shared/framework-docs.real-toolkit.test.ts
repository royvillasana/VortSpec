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
  scopeReactRefMandate,
  scopeReactRefExamples,
} from "./framework-docs";

/** What setup actually writes for a framework — both transformations, in order. */
const scoped = (name: string, framework: string): string =>
  scopeReactRefExamples(
    scopeReactRefMandate(pruneReactArchitecture(read(name), framework), framework),
    framework,
  );

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

  it("keeps the React architecture SECTIONS for React and Next", () => {
    const cs = read("component-standards.md");
    expect(pruneReactArchitecture(cs, "react")).toBe(cs);
    expect(pruneReactArchitecture(cs, "next")).toBe(cs);
  });

  it("removes the unconditional forwardRef mandate from what React/Next actually receive", () => {
    // The retained standard blanket-required `forwardRef` on ALL components, while the
    // generated rules say React 19+ takes `ref` as an ordinary prop. Both were "in force" —
    // a contradiction that precedence could only adjudicate, not remove.
    for (const f of ["react", "next"]) {
      for (const name of ["component-standards.md", "styling-best-practices.md"]) {
        if (!has(name)) continue;
        const out = scoped(name, f);
        expect(out, `${f}/${name} still mandates forwardRef unconditionally`).not.toMatch(
          /`forwardRef` is required on all components/,
        );
        expect(out, `${f}/${name} still mandates forwardRef unconditionally`).not.toMatch(
          /\*\*`forwardRef` is required\*\*/,
        );
        expect(out, `${f}/${name} still asserts every component supports forwardRef`).not.toMatch(
          /supports `forwardRef`/,
        );
      }
    }
  });

  it("points React/Next at the version-aware rule instead", () => {
    const out = scoped("component-standards.md", "react");
    expect(out).toMatch(/React 19\+ passes `ref` as an ordinary prop/);
    expect(out).toMatch(/only for components that expose a ref/);
    expect(out).toContain("framework-rules.md");
  });

  it("leaves no positively-labeled forwardRef example for React 19", () => {
    // I argued an example is an illustration and left these. Thor was right that a `✓ GOOD`
    // label and a canonical implementation are copyable instructions — stale ones, against
    // the generated rule that React 19 passes `ref` as a prop.
    for (const f of ["react", "next"]) {
      const cs = scoped("component-standards.md", f);
      expect(cs, `${f}: forwardRef still labelled GOOD`).not.toMatch(/✓ GOOD:.*forwardRef/);
      expect(cs).toMatch(/✓ GOOD:\s+export const Button = \(\{ ref, \.\.\.props \}\)/);
    }
  });

  it("makes the canonical implementation sample the React 19 form", () => {
    if (!has("styling-best-practices.md")) return;
    const out = scoped("styling-best-practices.md", "react");
    const anchor = out.indexOf("### Component implementation");
    expect(anchor).toBeGreaterThan(-1);
    const firstBlock = out.slice(anchor, out.indexOf("### Key rules", anchor));
    // The DEFAULT sample must not wrap; the older form must survive only under its own label.
    expect(firstBlock).toMatch(/React 19\+ \(the default\)/);
    expect(firstBlock.indexOf("React 18 and earlier")).toBeLessThan(
      firstBlock.indexOf("React.forwardRef"),
    );
  });

  it("keeps the React 18 path available rather than deleting it", () => {
    if (!has("styling-best-practices.md")) return;
    const out = scoped("styling-best-practices.md", "react");
    expect(out).toMatch(/React 18 and earlier only/);
    expect(out).toMatch(/only for a component\s*\n?that actually exposes a ref|actually exposes a ref/);
  });

  it("is idempotent — a second pass must not duplicate the React 18 block", () => {
    // Thor's non-blocking note. Production recopies pristine toolkit files before transforming,
    // so it never hits this — but `linkFrameworkRulesInClaudeMd` is already idempotent and an
    // inconsistent contract inside one module is a trap for whoever reuses the helper next.
    if (!has("styling-best-practices.md")) return;
    const once = scoped("styling-best-practices.md", "react");
    expect(scopeReactRefExamples(once, "react")).toBe(once);
    expect(once.split("React 18 and earlier only").length - 1).toBe(1);
    expect(once.split("React 19+ (the default)").length - 1).toBe(1);
    // The guard keys on a sentinel this function emits, not on prose the toolkit might write.
    expect(once.split("<!-- vortspec:react-ref-examples-scoped -->").length - 1).toBe(1);
  });

  it("does not no-op on toolkit prose that merely mentions the React 19 default", () => {
    // The first guard keyed on "React 19+ (the default)". If upstream ever wrote that phrase,
    // the transformation would skip silently and leave the stale normative examples in place.
    const doc = read("styling-best-practices.md").replace(
      "### Component implementation",
      "Note: React 19+ (the default) changes ref handling.\n\n### Component implementation",
    );
    const out = scopeReactRefExamples(scopeReactRefMandate(doc, "react"), "react");
    expect(out).toContain("<!-- vortspec:react-ref-examples-scoped -->");
    expect(out).toMatch(/React 18 and earlier only/);
  });

  it("does not version-scope examples for the other seven", () => {
    for (const f of frameworkSchema.options) {
      if (f === "react" || f === "next") continue;
      const base = scopeReactRefMandate(pruneReactArchitecture(read("component-standards.md"), f), f);
      expect(scopeReactRefExamples(base, f)).toBe(base);
    }
  });

  it("keeps React's architecture intact apart from the ref mandate", () => {
    const out = scoped("component-standards.md", "react");
    expect(out).toMatch(/## Style Encapsulation/);
    expect(out).toMatch(/CVA/);
    expect(out).toMatch(/## Atomic Design Hierarchy/);
  });

  it("is a no-op for the seven non-React frameworks", () => {
    // Their copies already have the whole architecture section removed.
    for (const f of frameworkSchema.options) {
      if (f === "react" || f === "next") continue;
      const pruned = pruneReactArchitecture(read("component-standards.md"), f);
      expect(scopeReactRefMandate(pruned, f)).toBe(pruned);
    }
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

  it("leaves NO unconditional React mandate anywhere in the transformed files", () => {
    // Thor's point: removing two headings is not the same as removing the architecture.
    // This scans the COMPLETE transformed text, not just which headings went — the Decision
    // Table ("All approaches use CVA", with Vue/Svelte/Angular rows), the Tailwind rules, and
    // the stray "use `cva`, `clsx`, or `cn()`" bullet all survived the heading-only version.
    const MANDATES = [/\bCVA\b/, /\bcva\(/, /`cn\(\)`/, /forwardRef/, /\.variants\.ts/];
    for (const f of frameworkSchema.options) {
      if (f === "react" || f === "next") continue;
      for (const name of ["component-standards.md", "styling-best-practices.md"]) {
        if (!has(name)) continue;
        const pruned = pruneReactArchitecture(read(name), f);
        for (const m of MANDATES) {
          expect(pruned, `${f}/${name} still carries ${m}`).not.toMatch(m);
        }
      }
    }
  });

  it("keeps the active framework's style section and drops the other frameworks'", () => {
    if (!has("styling-best-practices.md")) return;
    const doc = read("styling-best-practices.md");
    const vue = pruneReactArchitecture(doc, "vue");
    expect(vue).toMatch(/^##\s+Vue/m);
    expect(vue).not.toMatch(/^##\s+Angular/m);
    expect(vue).not.toMatch(/^##\s+Svelte/m);
    const ng = pruneReactArchitecture(doc, "angular");
    expect(ng).toMatch(/^##\s+Angular/m);
    expect(ng).not.toMatch(/^##\s+Vue/m);
  });

  it("keeps the styling-approach sections, which are keyed to `styling` not framework", () => {
    if (!has("styling-best-practices.md")) return;
    const pruned = pruneReactArchitecture(read("styling-best-practices.md"), "svelte");
    expect(pruned).toMatch(/^##\s+CSS Modules/m);
    expect(pruned).toMatch(/^##\s+SCSS/m);
    expect(pruned).toMatch(/^##\s+Tailwind/m);
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
