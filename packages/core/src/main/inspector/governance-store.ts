import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  defaultGovernance,
  governanceConfigSchema,
  type GovernanceConfig,
} from "@vortspec/core/governance";
import { AI_DIR } from "@vortspec/core/artifact-paths";

/**
 * Reading and seeding a project's governance rules — OpenSpec change: agentic-design-system, task 4.1.
 *
 * The file is the project's OWN copy. It is seeded once with the defaults and then belongs to the
 * team: they disable a rule, add one, or reword a correction to match their vocabulary. That is why
 * `seedGovernance` never overwrites — a rules file rewritten on every index build would silently
 * revert a deliberate `enabled: false` on the next scan, and nobody would connect the two.
 */

export const GOVERNANCE_PATH = `${AI_DIR}/governance/rules.json`;

/**
 * The project's rules, seeded from the defaults if absent.
 *
 * A file that exists but does not parse falls back to the defaults rather than throwing: an audit
 * that refuses to run because someone mistyped a rule is worse than one that runs the defaults and
 * says so. The malformed file is left exactly as written, so the mistake is still there to fix.
 */
export async function readGovernance(projectPath: string): Promise<{ config: GovernanceConfig; source: "project" | "defaults" | "malformed" }> {
  const raw = await readFile(join(projectPath, GOVERNANCE_PATH), "utf8").catch(() => null);
  if (raw === null) return { config: defaultGovernance(), source: "defaults" };
  try {
    return { config: governanceConfigSchema.parse(JSON.parse(raw)), source: "project" };
  } catch {
    return { config: defaultGovernance(), source: "malformed" };
  }
}

/**
 * Write the defaults if no rules file exists yet. Returns the path when it wrote one, else null.
 *
 * Never overwrites. See the note above: this runs on every index build, and clobbering a team's
 * edits on a routine rescan is the kind of data loss that gets a feature turned off.
 */
export async function seedGovernance(projectPath: string): Promise<string | null> {
  const existing = await readFile(join(projectPath, GOVERNANCE_PATH), "utf8").catch(() => null);
  if (existing !== null) return null;
  await mkdir(join(projectPath, `${AI_DIR}/governance`), { recursive: true });
  await writeFile(
    join(projectPath, GOVERNANCE_PATH),
    `${JSON.stringify(defaultGovernance(), null, 2)}\n`,
    "utf8",
  );
  return GOVERNANCE_PATH;
}
