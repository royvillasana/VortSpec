import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ADOPTION_REPORT, VIOLATIONS_REPORT, generateReports } from "./reports";
import { GOVERNANCE_PATH } from "./governance-store";

let dir = "";
const STAMP = "2026-08-07T12:00:00.000Z";

const write = async (relative: string, content: string) => {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content, "utf8");
};

/**
 * A project with one clean component and one whose tokens all EXIST but are applied wrongly —
 * a surface token on text, and a literal line-height beside a tokenized size.
 */
async function project(designSource = "figma"): Promise<void> {
  await write(
    ".sdd-de/project.yaml",
    `framework: react\nlanguage: typescript\nstyling: tailwind\ndesign_source: ${designSource}\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n`,
  );
  await write("src/tokens.css", ":root { --color-surface-raised: #fff; --color-fg-default: #111; --font-size-lg: 18px; }\n");
  await write(
    ".sdd-de/components.json",
    JSON.stringify([
      { name: "Callout", level: "molecule" },
      { name: "Badge", level: "atom" },
    ]),
  );
  await write(
    "src/components/Callout.tsx",
    `export const Callout = () => (
  <div className="bg-[var(--color-surface-raised)] text-[var(--color-surface-raised)]" style={{ fontSize: "var(--font-size-lg)", lineHeight: 1.4 }}>hi</div>
);`,
  );
  await write(
    "src/components/Badge.tsx",
    `export const Badge = () => <span className="bg-[var(--color-surface-raised)] text-[var(--color-fg-default)]" />;`,
  );
  await write("src/views/Home.tsx", `import { Badge } from "../components/Badge";\nexport const Home = () => <Badge/>;`);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-reports-"));
  await project();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("generating the reports (tasks 4.5, 4.6)", () => {
  it("writes both under .vortspec/ai/reports/", async () => {
    const result = await generateReports(dir, { generatedAt: STAMP });
    expect(result.written).toEqual([ADOPTION_REPORT, VIOLATIONS_REPORT]);
  });

  it("reports the intent violations grouped under the component that owns them", async () => {
    await generateReports(dir, { generatedAt: STAMP });
    const text = await readFile(join(dir, VIOLATIONS_REPORT), "utf8");
    expect(text).toContain("## Callout");
    expect(text).toContain("hierarchy/background-token-on-text");
    expect(text).toContain("typography/composite-applied-piecemeal");
    // The clean component has nothing to answer for and gets no heading.
    expect(text).not.toContain("## Badge");
  });

  it("carries a fix on every finding", async () => {
    await generateReports(dir, { generatedAt: STAMP });
    const text = await readFile(join(dir, VIOLATIONS_REPORT), "utf8");
    // One fix line per finding line — not "at least one somewhere", which a single stray Fix would
    // satisfy while the rest of the findings carried none.
    expect(lineCount(text, "- **")).toBeGreaterThan(0);
    expect(lineCount(text, "  - Fix: ")).toBe(lineCount(text, "- **"));
  });

  it("reports adoption from the same index it just built", async () => {
    await generateReports(dir, { generatedAt: STAMP });
    const text = await readFile(join(dir, ADOPTION_REPORT), "utf8");
    expect(text).toContain("# Adoption");
    expect(text).toContain(STAMP);
    // Badge is imported AND rendered by the page; Callout is used by nothing.
    expect(text).toContain("| Callout |");
    expect(text).toContain("Badge");
  });

  it("uses the project's own rules when it has them, and says which it used", async () => {
    const first = await generateReports(dir, { generatedAt: STAMP });
    expect(first.rulesFrom).toBe("defaults");

    const seeded = JSON.parse(await readFile(join(dir, GOVERNANCE_PATH), "utf8"));
    for (const rule of seeded.rules) if (rule.family === "hierarchy") rule.enabled = false;
    await write(GOVERNANCE_PATH, JSON.stringify(seeded, null, 2));

    const second = await generateReports(dir, { generatedAt: STAMP });
    expect(second.rulesFrom).toBe("project");
    const text = await readFile(join(dir, VIOLATIONS_REPORT), "utf8");
    expect(text).not.toContain("hierarchy/background-token-on-text");
  });
});

describe("a consumed library is never written into (task 4.9)", () => {
  it("still reports findings for a consume source", async () => {
    // Findings about someone else's library are still findings. Suppressing them would make the
    // Design System screen for a consumed library permanently, falsely clean.
    await project("enterprise");
    const result = await generateReports(dir, { generatedAt: STAMP });
    expect(result.consumeSource).toBe(true);
    expect(result.violations).toBeGreaterThan(0);
  });

  it("writes ONLY inside .vortspec/, never beside the consumed component", async () => {
    await project("enterprise");
    const before = await snapshot(join(dir, "src"));
    await generateReports(dir, { generatedAt: STAMP });
    expect(await snapshot(join(dir, "src"))).toEqual(before);

    const result = await generateReports(dir, { generatedAt: STAMP });
    for (const path of result.written) expect(path.startsWith(".vortspec/")).toBe(true);
  });
});

function lineCount(text: string, needle: string): number {
  return text.split("\n").filter((line) => line.startsWith(needle)).length;
}

/** Every file under a directory with its contents — proves nothing was added, removed or edited. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const here = join(path, entry.name);
      if (entry.isDirectory()) await walk(here);
      else out[here] = await readFile(here, "utf8");
    }
  };
  await walk(root);
  return out;
}
