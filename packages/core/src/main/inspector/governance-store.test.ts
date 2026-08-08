import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GOVERNANCE_PATH, readGovernance, seedGovernance } from "./governance-store";
import { buildRelationshipIndex } from "./relationship-index";
import { DEFAULT_RULES } from "@vortspec/core/governance";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-gov-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = async (relative: string, content: string) => {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content, "utf8");
};

describe("seeding a project's governance rules (task 4.1)", () => {
  it("writes the defaults when none exist", async () => {
    expect(await seedGovernance(dir)).toBe(GOVERNANCE_PATH);
    const written = JSON.parse(await readFile(join(dir, GOVERNANCE_PATH), "utf8"));
    expect(written.rules).toHaveLength(DEFAULT_RULES.length);
  });

  it("NEVER overwrites an existing file", async () => {
    // The file belongs to the team once it exists. Rewriting it on a routine rescan would silently
    // revert a deliberate `enabled: false`, and nobody would connect the audit's return to the scan.
    await seedGovernance(dir);
    const edited = JSON.parse(await readFile(join(dir, GOVERNANCE_PATH), "utf8"));
    edited.rules[0].enabled = false;
    await write(GOVERNANCE_PATH, JSON.stringify(edited, null, 2));

    expect(await seedGovernance(dir)).toBeNull();
    const { config, source } = await readGovernance(dir);
    expect(source).toBe("project");
    expect(config.rules[0]?.enabled).toBe(false);
  });

  it("survives an index rebuild with the team's edit intact", async () => {
    await write(
      ".sdd-de/project.yaml",
      "framework: react\nlanguage: typescript\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
    );
    await write("src/components/Button.tsx", "export const Button = () => <button/>;\n");
    await buildRelationshipIndex(dir, { generatedAt: "2026-08-07T12:00:00.000Z" });

    const seeded = JSON.parse(await readFile(join(dir, GOVERNANCE_PATH), "utf8"));
    seeded.rules[0].enabled = false;
    await write(GOVERNANCE_PATH, JSON.stringify(seeded, null, 2));

    await buildRelationshipIndex(dir, { generatedAt: "2026-08-07T13:00:00.000Z" });
    expect((await readGovernance(dir)).config.rules[0]?.enabled).toBe(false);
  });
});

describe("reading rules", () => {
  it("falls back to the defaults when the file is malformed, and says so", async () => {
    // An audit that refuses to run because someone mistyped a rule is worse than one that runs the
    // defaults and reports which it used.
    await write(GOVERNANCE_PATH, "{ not json");
    const { config, source } = await readGovernance(dir);
    expect(source).toBe("malformed");
    expect(config.rules).toHaveLength(DEFAULT_RULES.length);
  });

  it("leaves a malformed file exactly as written", async () => {
    await write(GOVERNANCE_PATH, "{ not json");
    await readGovernance(dir);
    expect(await readFile(join(dir, GOVERNANCE_PATH), "utf8")).toBe("{ not json");
  });

  it("reports the defaults as defaults when nothing was seeded", async () => {
    expect((await readGovernance(dir)).source).toBe("defaults");
  });
});
