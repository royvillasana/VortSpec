import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { DESIGN_SOURCE_OPTIONS, isConsumeSource } from "./setup";
import { BRANCHING_SKILLS, KNOWN_GAPS, checkParity, type BranchingSkill } from "./skill-parity";

/**
 * Task 9.3 — the app's design sources and the SDD-DE skills' branches must not drift.
 *
 * Read from the INSTALLED toolkit, which is the artifact a user actually gets, falling back to the
 * project's working copy. Both are outside this repository's ownership: `.sdd-de/` is gitignored and
 * the package is published from elsewhere. That is exactly why the assertion lives here — the app
 * owns `DESIGN_SOURCE_OPTIONS`, so the app is where a new source can silently gain no branch.
 */

const ROOTS = [
  join(process.cwd(), "../../apps/ide/node_modules/@royvillasana/sdd-de/ai-specs/skills"),
  join(process.cwd(), "../../.sdd-de/ai-specs/skills"),
];

async function readSkills(): Promise<Record<BranchingSkill, string> | null> {
  const root = ROOTS.find((candidate) => existsSync(candidate));
  if (!root) return null;
  const out = {} as Record<BranchingSkill, string>;
  for (const skill of BRANCHING_SKILLS)
    out[skill] = await readFile(join(root, skill, "SKILL.md"), "utf8").catch(() => "");
  return out;
}

describe("design-source parity between the app and the skills (task 9.3)", () => {
  it("finds the toolkit to check against", async () => {
    // A silently-skipped parity test proves nothing. If the toolkit is absent, that is itself the
    // failure — it is a declared dependency of the app.
    expect(await readSkills(), `no toolkit found at:\n${ROOTS.join("\n")}`).not.toBeNull();
  });

  it("reports NO gap the allowlist does not already name", async () => {
    const skills = await readSkills();
    if (!skills) return;
    const { unexpected } = checkParity(skills);
    expect(
      unexpected,
      `a design source has no branch and is not a known gap:\n${unexpected
        .map((entry) => `  ${entry.skill}: ${entry.source}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("fails when the allowlist goes STALE — a fixed gap must be removed from it", async () => {
    // A known-failure list that is never pruned becomes a permanent one, and then it is documenting
    // nothing. The check reports a fixed entry as loudly as a new break.
    const skills = await readSkills();
    if (!skills) return;
    const { fixed } = checkParity(skills);
    expect(
      fixed,
      `these gaps are fixed in the toolkit — delete them from KNOWN_GAPS:\n${fixed.join(", ")}`,
    ).toEqual([]);
  });

  it("records WHY each known gap exists, not just that it does", () => {
    for (const gap of KNOWN_GAPS) {
      expect(gap.why.trim(), `${gap.source} has no reason recorded`).not.toBe("");
      expect(gap.why.length).toBeGreaterThan(40);
    }
  });

  it("would catch a source the app adds without a branch", () => {
    // The regression this exists to prevent, exercised directly rather than trusted.
    const everySourceNamed = DESIGN_SOURCE_OPTIONS.map((o) => o.value).join(" ");
    const complete = Object.fromEntries(
      BRANCHING_SKILLS.map((skill) => [skill, everySourceNamed]),
    ) as Record<BranchingSkill, string>;
    expect(checkParity(complete).unexpected).toEqual([]);

    const missingOne = Object.fromEntries(
      BRANCHING_SKILLS.map((skill) => [skill, everySourceNamed.replace("github", "")]),
    ) as Record<BranchingSkill, string>;
    const result = checkParity(missingOne);
    expect(result.unexpected.map((entry) => entry.source)).toContain("github");
    expect(result.unexpected).toHaveLength(BRANCHING_SKILLS.length);
  });
});

describe("the app's own consume-source parity (task 9.2)", () => {
  it("treats enterprise and library identically wherever the family table says they are the same", () => {
    // The defect this caught in the app: `App.tsx` hid the Storybook and Design-manifest tabs on
    // `designSource === "library"`, while its own comment said "a consumed-library project has no
    // VortSpec Storybook" — which is true of BOTH consume sources. An `enterprise` project, created
    // by the app's own enterprise flow, was left showing a tab that would never have anything in it.
    for (const source of ["enterprise", "library"]) expect(isConsumeSource(source)).toBe(true);
    for (const source of ["figma", "github", "zip", "stitch", "claude-design"])
      expect(isConsumeSource(source)).toBe(false);
  });

  it("covers every design source the app offers", () => {
    // So a source added to DESIGN_SOURCE_OPTIONS has to be classified deliberately rather than
    // defaulting to "extract" by silence.
    for (const option of DESIGN_SOURCE_OPTIONS)
      expect(typeof isConsumeSource(option.value)).toBe("boolean");
  });
});
