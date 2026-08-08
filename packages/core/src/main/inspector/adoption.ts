import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parseToon } from "@vortspec/core/toon";
import { INDEX_PATH, USAGE_PATH } from "@vortspec/core/artifact-paths";
import type { AdoptionSummary } from "@vortspec/core/inspector";
import { indexStaleness } from "./relationship-index";

/**
 * The adoption summary the Design System screen shows.
 *
 * READS the committed artifacts; it never rebuilds the index. `generateReports` already pays for a
 * build when the Inspector loads, and paying for a second one here would make opening the Design
 * System screen slow for data that is sitting on disk. It also guarantees the panel and
 * `reports/adoption.md` agree: both are projections of the same `index.toon`.
 *
 * Null when the index has not been built — "we have not looked" is not "nothing is unused", and a
 * panel showing three zeroes would say the second while meaning the first.
 */
export async function adoptionSummary(projectPath: string): Promise<AdoptionSummary | null> {
  const index = await readArtifact(projectPath, INDEX_PATH);
  if (!index) return null;
  const usage = await readArtifact(projectPath, USAGE_PATH);

  const stats = (index.stats ?? {}) as Record<string, number | boolean>;
  const rows = Array.isArray(index.components) ? (index.components as Record<string, unknown>[]) : [];

  // Design-system components only. A page that nothing renders is not an adoption problem — it is
  // the top of the tree, and counting it would put every route in the "unimported" list.
  const components = rows.filter((row) => row.kind === "component");
  const byState = (state: string) =>
    components
      .filter((row) => row.adoption === state)
      .map((row) => ({
        name: String(row.name ?? ""),
        path: String(row.path ?? ""),
        tier: String(row.tier ?? "") || null,
        imports: Number(row.imports ?? 0),
        instances: Number(row.instances ?? 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const neverRenderedFiles = new Map<string, string[]>();
  for (const entry of arrayOf(usage?.importedNeverRendered))
    neverRenderedFiles.set(String(entry.component ?? ""), splitList(entry.files));

  const staleness = await indexStaleness(projectPath).catch(() => null);

  return {
    generatedAt: typeof index.generatedAt === "string" ? index.generatedAt : null,
    // Surfaced so the panel can say the numbers describe code that has since changed, rather than
    // presenting them as current. A stale adoption count is the kind that gets acted on.
    stale: Boolean(staleness?.stale),
    total: components.length,
    adopted: byState("adopted"),
    importedNeverRendered: byState("imported-never-rendered").map((row) => ({
      ...row,
      importedBy: neverRenderedFiles.get(row.name) ?? [],
    })),
    unimported: byState("unimported"),
    shadows: arrayOf(usage?.shadows).map((shadow) => ({
      component: String(shadow.component ?? ""),
      file: String(shadow.file ?? ""),
      overlap: Number(shadow.overlap ?? 0),
      sharedTokens: splitList(shadow.sharedTokens),
    })),
    truncated: Boolean(stats.truncated),
  };
}

async function readArtifact(
  projectPath: string,
  relative: string,
): Promise<Record<string, unknown> | null> {
  const raw = await readFile(join(projectPath, relative), "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    return parseToon(raw) as Record<string, unknown>;
  } catch {
    // A malformed artifact reads as absent rather than throwing: the screen degrades to "not built"
    // instead of failing to render, and the malformed file is still there to diagnose.
    return null;
  }
}

function arrayOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Lists are stored joined with `|`, because `,` is the row delimiter. */
function splitList(value: unknown): string[] {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}
