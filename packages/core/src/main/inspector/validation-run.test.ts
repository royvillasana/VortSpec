import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { VALIDATION_DIR } from "@vortspec/core/validation-page";
import { auditVerdict, describeCoverage } from "@vortspec/core/audit-report";
import { runValidationAudit } from "./validation-run";
import { prepareBenchmark } from "./benchmark";

/**
 * The validation run — OpenSpec change: agentic-design-system, tasks 2b.4 and 2b.5.
 *
 * 2b.5's criteria, asserted directly: a project with NO screens produces a complete audit and a
 * runnable benchmark; a component with no variants still appears; and the pages are gone afterwards
 * unless kept.
 */

let dir = "";
const RAN = "2026-08-07T12:00:00.000Z";

async function write(relative: string, content: string): Promise<void> {
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

const exists = async (relative: string): Promise<boolean> =>
  access(join(dir, relative)).then(() => true, () => false);

/** Components only. NO screens anywhere — the state group 2b exists for. */
async function componentsOnlyProject(): Promise<void> {
  await write(".sdd-de/project.yaml", "framework: react\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n");
  await write("src/tokens.css", ":root {\n  --color-primary: #1d4ed8;\n  --spacing-4: 16px;\n}\n");
  await write(
    ".sdd-de/components.json",
    JSON.stringify([
      { name: "Button", level: "atom" },
      { name: "Badge", level: "atom" },
      { name: "Card", level: "molecule" },
    ]),
  );
  // Button has variants; Badge deliberately has none — 2b.5 requires it to appear anyway.
  // CVA is how VortSpec declares variants (and how `parseProps` reads them) — a TS union type is
  // not a variant axis as far as the roster is concerned.
  await write(
    "src/components/Button.variants.ts",
    `export const button = cva("btn", { variants: { variant: { primary: "is-primary", danger: "is-danger" } } });`,
  );
  await write(
    "src/components/Button.tsx",
    `import { button } from "./Button.variants";\nexport const Button = ({ variant }) => <button className={button({ variant })} style={{ color: "#1d4ed8" }} />;`,
  );
  await write("src/components/Badge.tsx", `export const Badge = () => <span/>;`);
  await write("src/components/Card.tsx", `export const Card = () => <div style={{ padding: "16px" }} />;`);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-validation-run-"));
  await componentsOnlyProject();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("a project with NO screens audits completely (task 2b.5)", () => {
  it("generates pages, audits against them, and finds the real violations", async () => {
    const result = await runValidationAudit(dir, { ranAt: RAN });

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.report?.componentCreation.findings.length).toBeGreaterThan(0);
    // The evidence is marked weaker, and the prose says why.
    expect(result.report?.componentCreation.evidence).toBe("generated");
    expect(describeCoverage(result.report!).join(" ")).toContain("not that they are used correctly in context");
  });

  it("includes a component with NO variants", async () => {
    // Coverage must not depend on a component having a variant axis.
    const result = await runValidationAudit(dir, { keep: true, ranAt: RAN });
    const atoms = await readFile(join(dir, `${VALIDATION_DIR}/Atoms.tsx`), "utf8");
    expect(atoms).toContain("<Badge />");
    expect(atoms).toContain('<Button variant="primary" />');
  });

  it("still reports INCOMPLETE, because the screen audit has not run", async () => {
    // The floor, not the ceiling: a complete audit A is not a complete picture.
    const result = await runValidationAudit(dir, { ranAt: RAN });
    expect(auditVerdict(result.report!).verdict).toBe("incomplete");
    expect(auditVerdict(result.report!).reason).toContain("screen-generation has not run");
  });

  it("makes the benchmark runnable — the pages give Q2 a subject", async () => {
    // Before this, packages/ui-style projects resolved NO entry page and Q2–Q4 had nothing to ask
    // about. A kept validation page is a real entry page.
    await runValidationAudit(dir, { keep: true, ranAt: RAN });
    const prepared = await prepareBenchmark(dir);
    expect(prepared.entryPage).not.toBeNull();
    expect(prepared.questions).toHaveLength(4);
  });
});

describe("the pages are gone afterwards unless kept (tasks 2b.4, 2b.5)", () => {
  it("removes them by default", async () => {
    const result = await runValidationAudit(dir, { ranAt: RAN });
    expect(result.kept).toBe(false);
    for (const page of result.pages) expect(await exists(page)).toBe(false);
    expect(await exists(VALIDATION_DIR)).toBe(false);
  });

  it("keeps them on request, and says what keeping them is FOR", async () => {
    const result = await runValidationAudit(dir, { keep: true, ranAt: RAN });
    expect(result.kept).toBe(true);
    for (const page of result.pages) expect(await exists(page)).toBe(true);
    expect(result.message).toContain('"whole design system rendered"');
    expect(result.message).toContain("floor, not the ceiling");
  });

  it("encourages auditing real screens either way", async () => {
    const removed = await runValidationAudit(dir, { ranAt: RAN });
    expect(removed.message).toContain("your own screens");
    const kept = await runValidationAudit(dir, { keep: true, ranAt: RAN });
    expect(kept.message).toContain("your own screens");
  });

  it("cleans up even when the audit throws", async () => {
    // The `finally`. A crashed audit that leaves generated files in someone's source tree is the
    // litter that makes a tool feel unsafe to run.
    await rm(join(dir, "src/tokens.css"), { force: true });
    await write(".sdd-de/project.yaml", "framework: react\nstyling: css\ntoken_file: src/missing.css\ncomponent_dir: src/components\n");
    await runValidationAudit(dir, { ranAt: RAN }).catch(() => undefined);
    expect(await exists(VALIDATION_DIR)).toBe(false);
  });
});

describe("a framework with no generator does not fake an audit (task 2b.2)", () => {
  it("returns the prompt and runs NO audit", async () => {
    // Auditing pages that were never written would report a clean design system nobody examined.
    await write(".sdd-de/project.yaml", "framework: angular\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n");
    const result = await runValidationAudit(dir, { ranAt: RAN });

    expect(result.report).toBeNull();
    expect(result.pages).toEqual([]);
    expect(result.prompt).toContain("data-validation-component");
    expect(result.message).toContain("no deterministic validation-page generator");
  });
});

describe("nothing to validate", () => {
  it("says so rather than generating an empty page", async () => {
    const bare = await mkdtemp(join(tmpdir(), "vortspec-validation-bare-"));
    try {
      const result = await runValidationAudit(bare, { ranAt: RAN });
      expect(result.pages).toEqual([]);
      expect(result.message).toContain("No components to validate yet");
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});
