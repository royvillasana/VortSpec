import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProject, resyncToolkit } from "./setup-manager";
import { COMPONENT_TOKEN_DOC_PATH, COMPONENT_TOKEN_PREFIX } from "@vortspec/core/component-tokens";
import type { SetupAnswers } from "@vortspec/core/setup";

/**
 * The PRODUCTION filesystem paths, executed — not the pure transform they call.
 *
 * The defect immediately before this was a correct transform behind a correct-looking call site
 * whose only resync output was a doc the extraction skill never opens. Unit tests over
 * `ensureComponentTokenRule` passed throughout that bug, because the function was never wrong —
 * the wiring was. So these run `createProject` and `resyncToolkit` for real, against temp
 * projects, and assert what is left on disk.
 *
 * Every test gets its own `mkdtemp` directory. A shared fixture path is the exact failure that
 * poisoned the mutation driver earlier in this thread.
 */

const RULE_KEY = "component_token_prefix";

const answers = (framework: string): SetupAnswers =>
  ({
    framework,
    language: "typescript",
    designSource: "figma",
    figmaFileUrl: "https://figma.com/design/ABC/DS",
    figmaTokenCollection: "Tokens",
    styling: "css-modules",
    tokenFile: "src/styles/tokens.css",
    componentDir: "src/components",
    testRunner: "vitest",
  }) as SetupAnswers;

async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vortspec-tokens-"));
}

/**
 * Explicit timeouts, because these are real filesystem work rather than pure functions.
 *
 * `createProject` and `resyncToolkit` each recursively copy the packaged toolkit's `ai-specs/
 * skills` and `docs` trees; resync additionally `rm -rf`s them first. Vitest's 5s default was
 * enough when this file ran alone and NOT enough under full-suite concurrency — Thor's run timed
 * out on the two-resync case at exactly 5000 ms. A gate that passes only on a quiet machine is
 * not a gate, so the budget is stated rather than inherited.
 *
 * Sized to the work: one toolkit copy per resync, two in the byte-identical case.
 */
const ONE_PASS_MS = 30_000;
const TWO_PASS_MS = 60_000;

/** Count of rule declarations — "exactly one" is the assertion Thor asked for. */
const ruleCount = (yaml: string): number =>
  yaml.split("\n").filter((l) => l.trimStart().startsWith(`${RULE_KEY}:`)).length;

describe("createProject leaves the token contract on disk", () => {
  it("writes exactly one rule into project.yaml, the owned doc, and an entry link", async () => {
    const dir = await temp();
    try {
      await createProject(dir, answers("react"));

      const yaml = await readFile(join(dir, ".sdd-de", "project.yaml"), "utf8");
      expect(ruleCount(yaml)).toBe(1);
      expect(yaml).toContain(COMPONENT_TOKEN_PREFIX);

      expect(existsSync(join(dir, COMPONENT_TOKEN_DOC_PATH))).toBe(true);

      const claude = await readFile(join(dir, "CLAUDE.md"), "utf8");
      expect(claude).toContain(COMPONENT_TOKEN_DOC_PATH);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, ONE_PASS_MS);
});

describe("resyncToolkit reaches a legacy project", () => {
  /** A project set up before this contract existed: real config, no rule. */
  async function legacyProject(yamlBody: string): Promise<string> {
    const dir = await temp();
    await mkdir(join(dir, ".sdd-de", "ai-specs", "skills"), { recursive: true });
    await mkdir(join(dir, ".sdd-de", "docs"), { recursive: true });
    await writeFile(join(dir, ".sdd-de", "project.yaml"), yamlBody, "utf8");
    return dir;
  }

  const LEGACY = [
    "framework: react",
    "language: typescript",
    "design_source: figma",
    'figma_file_url: "https://figma.com/design/ABC/DS"',
    "token_file: src/styles/tokens.css",
    "component_dir: src/components",
    "",
  ].join("\n");

  it("adds exactly one rule and preserves every original config line", async () => {
    const dir = await legacyProject(LEGACY);
    try {
      await resyncToolkit(dir);
      const yaml = await readFile(join(dir, ".sdd-de", "project.yaml"), "utf8");
      expect(ruleCount(yaml)).toBe(1);
      for (const line of LEGACY.trim().split("\n")) expect(yaml).toContain(line);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, ONE_PASS_MS);

  it("is byte-identical on a second resync", async () => {
    const dir = await legacyProject(LEGACY);
    try {
      await resyncToolkit(dir);
      const first = await readFile(join(dir, ".sdd-de", "project.yaml"), "utf8");
      await resyncToolkit(dir);
      const second = await readFile(join(dir, ".sdd-de", "project.yaml"), "utf8");
      expect(second).toBe(first);
      expect(ruleCount(second)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, TWO_PASS_MS);

  // The installer sits OUTSIDE scopeDocsToFramework precisely because that one returns early
  // with no framework. If it were ever moved inside, this legacy shape would lose the contract
  // silently — which is the failure mode, not a corner case.
  it("still installs when the legacy project has no framework set", async () => {
    const dir = await legacyProject("design_source: figma\ntoken_file: src/styles/tokens.css\n");
    try {
      await resyncToolkit(dir);
      const yaml = await readFile(join(dir, ".sdd-de", "project.yaml"), "utf8");
      expect(ruleCount(yaml)).toBe(1);
      expect(yaml).toContain(COMPONENT_TOKEN_PREFIX);
      expect(yaml).toContain("design_source: figma");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, ONE_PASS_MS);
});
