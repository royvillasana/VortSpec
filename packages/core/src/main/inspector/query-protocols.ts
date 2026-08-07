import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { queryProtocolDocuments, type ProtocolContext } from "@vortspec/core/query-protocols";
import { RULES_DIR } from "@vortspec/core/artifact-paths";
import type { RelationshipGraph } from "@vortspec/core/relationship-graph";

/**
 * Writing the query-protocol layer — OpenSpec change: agentic-design-system, task 3.1.
 *
 * The prose lives in `shared/query-protocols.ts`; this is the fs half plus the one derivation that
 * needs the graph: which atomic tiers this roster actually has.
 */

/** Most composed first — the order `atomic-hierarchy.md` teaches selection in. */
const TIER_ORDER = ["template", "organism", "molecule", "atom"];

/**
 * The tiers PRESENT on this roster, most composed first.
 *
 * Derived from the graph rather than assumed, because the hierarchy document instructs an agent to
 * select in this order. A project whose components are all atoms should not be told to look for
 * organisms first — it will go looking, find nothing, and have spent the tokens anyway.
 */
export function tiersPresent(graph: RelationshipGraph): string[] {
  const present = new Set(
    graph.components.filter((component) => component.designSystem).map((component) => component.tier),
  );
  return TIER_ORDER.filter((tier) => present.has(tier as never));
}

/** Write the four rule documents. Returns the project-relative paths written, sorted. */
export async function writeQueryProtocols(
  projectPath: string,
  context: ProtocolContext,
): Promise<string[]> {
  const documents = queryProtocolDocuments(context);
  await mkdir(join(projectPath, RULES_DIR), { recursive: true });
  const written: string[] = [];
  for (const [name, content] of Object.entries(documents).sort(([a], [b]) => a.localeCompare(b))) {
    const relative = `${RULES_DIR}/${name}`;
    await writeFile(join(projectPath, relative), content, "utf8");
    written.push(relative);
  }
  return written;
}
