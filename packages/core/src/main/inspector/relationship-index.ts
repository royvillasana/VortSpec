import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  buildRelationshipGraph,
  findShadowImplementations,
  isComponentFile,
  tokensUsed,
  type GraphFile,
  type RelationshipGraph,
  type ShadowFinding,
} from "@vortspec/core/relationship-graph";
import { parseToon, writeToon, type ToonValue } from "@vortspec/core/toon";
import { ALL_SOURCE_EXTS, profileFor } from "@vortspec/core/framework-profiles";
import { getInspectorComponents } from "./component-reader";
import { getInspectorTokens } from "./token-parser";
import { readProjectConfig } from "../workspace/config-manager";
import { tiersPresent, writeQueryProtocols } from "./query-protocols";
import { seedGovernance } from "./governance-store";
import { writePropsGlossary } from "./props-glossary";

/**
 * The fs half of the relationship index — OpenSpec change: agentic-design-system, task 2.6.
 *
 * Reads the project's sources, builds the graph (`shared/relationship-graph.ts` owns every decision
 * about WHAT a relationship is), and writes the three artifacts the reference architecture names:
 *
 *   .vortspec/ai/index.toon           — what exists
 *   .vortspec/ai/component-usage.toon — how components relate to each other
 *   .vortspec/ai/design-tokens.toon   — how components relate to tokens
 *
 * They are TOON and they are COMMITTED, so a change to the design system's shape shows up in a diff
 * a person can read. That is also why the writer is byte-stable: an artifact that reordered itself
 * on every build would show a change every time and train everyone to skip it.
 */

// Defined in `shared/artifact-paths.ts` — the query-protocol documents name these paths in their
// prose and `shared/` cannot import from `main/`. Re-exported so existing importers are unaffected.
import { AI_DIR, INDEX_PATH, USAGE_PATH, TOKENS_PATH, RULES_DIR } from "../../shared/artifact-paths";
export { AI_DIR, INDEX_PATH, USAGE_PATH, TOKENS_PATH, RULES_DIR };

export interface RelationshipIndexResult {
  graph: RelationshipGraph;
  shadows: ShadowFinding[];
  /** Project-relative paths written. */
  written: string[];
  generatedAt: string;
}

/**
 * Read every source file the graph needs, marking which are design-system components.
 *
 * `designSystem` comes from `component_dir` — the one place VortSpec already knows the difference
 * between "our design system" and "code that uses it". Shadow detection needs that direction, and
 * without it reports nothing rather than guessing (see `GraphFile.designSystem`).
 */
async function collectGraphFiles(projectPath: string): Promise<GraphFile[]> {
  const [config, components] = await Promise.all([
    readProjectConfig(projectPath),
    getInspectorComponents(projectPath).catch(() => null),
  ]);
  const componentDir = config?.componentDir ? normalize(config.componentDir) : null;
  const byPath = new Map<string, string>();
  const tierByPath = new Map<string, string>();
  for (const component of components?.components ?? [])
    if (component.file) {
      byPath.set(normalize(component.file), component.name);
      if (component.level) tierByPath.set(normalize(component.file), component.level);
    }

  const files: GraphFile[] = [];
  const seen = new Set<string>();
  const paths = [...byPath.keys()];
  // Component sources first, then any other source file that could RENDER one — a page that
  // imports Button is not on the component roster but is exactly where instances live.
  for (const relative of paths) await push(relative);
  for (const relative of await listSourceFiles(projectPath, config?.componentDir, config?.framework))
    await push(relative);

  async function push(relative: string): Promise<void> {
    if (seen.has(relative) || !isComponentFile(relative)) return;
    seen.add(relative);
    const source = await readFile(join(projectPath, relative), "utf8").catch(() => null);
    if (source === null) return;
    // Every scanned file gets a node NAME, not just roster components. A page is where instances
    // live, and two of the four benchmark questions are about pages — a graph that contains only
    // design-system components cannot answer either. `buildRelationshipGraph` prunes the files that
    // turn out to be connected to nothing, so a `utils.ts` swept up here never reaches the index.
    const component = byPath.get(relative) ?? nodeNameFor(relative);
    files.push({
      path: relative,
      // A separate template file is part of this component's source for graph purposes. Angular's
      // `templateUrl: './button.html'` puts every instance it renders in a file the `.ts` scan would
      // never open — so an Angular project's graph would be empty of edges without this, which is
      // the same failure the tag aliases fixed on the other side.
      source: `${source}\n${await readSiblingTemplate(projectPath, relative, source)}`,
      component,
      ...(ATOMIC_TIERS.has(tierByPath.get(relative) ?? "")
        ? { tier: tierByPath.get(relative) as "atom" | "molecule" | "organism" | "template" }
        : {}),
      ...(componentDir && relative.startsWith(`${componentDir}/`) ? { designSystem: true } : {}),
    });
  }
  return files;
}

/**
 * Source files under `src/` (or the project root), excluding dependencies and build output.
 *
 * Filtered by the FRAMEWORK's own extensions, not the union of every framework's. Angular's profile
 * is explicit that "the component IS the `.ts` class; the sibling `.html` is its template, not a
 * second component" — scanning `.html` as a component source makes every Angular component a
 * DUPLICATE node whose template file wins the name, taking the `.ts` file's `selector` with it and
 * leaving the graph edgeless. A template is reached through `templateUrl`, which is the only way it
 * is actually part of a component.
 *
 * Falls back to the union when no framework is configured — a scan with no profile should see more,
 * not less, since a missed file is a missed relationship.
 */
async function listSourceFiles(
  projectPath: string,
  componentDir?: string | null,
  framework?: string | null,
): Promise<string[]> {
  const extensions = profileFor(framework)?.sourceExts ?? ALL_SOURCE_EXTS;
  const { readdir } = await import("node:fs/promises");
  const skip = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".turbo", "coverage", ".vortspec", ".sdd-de"]);
  // The framework's own directories as well as `src` and `component_dir`. An Astro project keeps
  // layouts in `src/layouts` and a SvelteKit project keeps routes in `src/routes`; walking only
  // `src` finds them by luck, and walking only `component_dir` misses every instance they render.
  const roots = ["src", componentDir ?? "", ...(profileFor(framework)?.scanDirs ?? [])].filter(Boolean);
  const out: string[] = [];
  const walk = async (relative: string, depth: number): Promise<void> => {
    if (depth > 12 || out.length > MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(join(projectPath, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const here = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(here, depth + 1);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) out.push(here);
    }
  };
  for (const root of [...new Set(roots.map(normalize))]) await walk(root, 0);
  // Deduped: the roots OVERLAP by design — `src` contains `src/components`, and a framework's
  // scanDirs contain both. Without this a file inside two roots is scanned twice, which
  // double-counts it in the staleness report and inflates the "files scanned" stat.
  return [...new Set(out)].sort();
}

/**
 * The template a component points at with `templateUrl`, or "".
 *
 * Resolved relative to the component file, and bounded to the project — a `templateUrl` is project
 * data, and a `../../../` in one must not read outside the tree.
 */
async function readSiblingTemplate(
  projectPath: string,
  relative: string,
  source: string,
): Promise<string> {
  const match = /\btemplateUrl\s*:\s*['"]([^'"]+)['"]/.exec(source);
  if (!match) return "";
  const dir = relative.split("/").slice(0, -1);
  const segments = [...dir, ...match[1].split("/")].filter((part) => part && part !== ".");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  const target = resolved.join("/");
  if (!target || target.startsWith("..")) return "";
  return (await readFile(join(projectPath, target), "utf8").catch(() => "")) || "";
}

/**
 * The node name for a file that is not on the component roster — its stem, PascalCased.
 *
 * `src/pages/index.tsx` → `Index`. Two files can produce the same NAME (the documented
 * `index.tsx` collision), which is exactly why every lookup in the graph is keyed on the PATH and
 * the name is only a label.
 */
function nodeNameFor(relative: string): string {
  const stem = (relative.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  return stem
    .split(/[-_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** The recorded levels that are real atomic tiers; anything else falls back to the path. */
const ATOMIC_TIERS = new Set(["atom", "molecule", "organism", "template"]);

/** A backstop so a pathological repo cannot stall an index build. Reported, never silent. */
const MAX_FILES = 4000;

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

/**
 * Build the graph and write the three artifacts.
 *
 * `generatedAt` is supplied by the caller so the build stays deterministic under test — the same
 * project and the same stamp produce byte-identical files, which is what makes the committed
 * artifacts reviewable.
 */
export async function buildRelationshipIndex(
  projectPath: string,
  options: { generatedAt?: string } = {},
): Promise<RelationshipIndexResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const [config, files, tokensResult] = await Promise.all([
    readProjectConfig(projectPath),
    collectGraphFiles(projectPath),
    getInspectorTokens(projectPath).catch(() => null),
  ]);

  const graph = buildRelationshipGraph(files, { framework: config?.framework ?? undefined });
  const shadows = findShadowImplementations(files, graph, { framework: config?.framework ?? undefined });

  const written: string[] = [];
  await mkdir(join(projectPath, AI_DIR), { recursive: true });
  for (const [path, content] of [
    [INDEX_PATH, indexArtifact(graph, shadows, generatedAt, files.length)],
    [USAGE_PATH, usageArtifact(graph, shadows, generatedAt)],
    [TOKENS_PATH, tokenArtifact(files, tokensResult?.tokens ?? [], generatedAt)],
  ] as const) {
    await writeFile(join(projectPath, path), content, "utf8");
    written.push(path);
  }

  // The rules are written by the SAME build that writes the artifacts they describe (task 3.1).
  // Separating them would let the two drift: rules naming a tier order the roster no longer has, or
  // pointing at an artifact path that moved, are worse than no rules — an agent follows them.
  written.push(
    ...(await writeQueryProtocols(projectPath, {
      framework: config?.framework ?? null,
      componentDir: config?.componentDir ? normalize(config.componentDir) : "the component directory",
      tiers: tiersPresent(graph),
      componentCount: graph.components.filter((component) => component.designSystem).length,
      generatedAt,
    })),
  );
  // The props glossary is DERIVED from the roster + metadata, so it belongs to the same build that
  // reads them (task 9b.1). Nothing is written when a project has no props to index.
  const glossary = await writePropsGlossary(projectPath, { generatedAt }).catch(() => ({ written: null }));
  if (glossary.written) written.push(glossary.written);

  // Seeded, not rewritten (task 4.1). Once a project has a rules file it is the team's; overwriting
  // it here would revert a deliberate `enabled: false` on the next routine rescan.
  const seeded = await seedGovernance(projectPath);
  if (seeded) written.push(seeded);

  return { graph, shadows, written, generatedAt };
}

/**
 * The nodes worth writing to an artifact.
 *
 * A `utils.ts` swept up by the scan is not a graph node, and leaving it in would inflate every count
 * the index reports. A page that renders nothing is likewise not a relationship. A design-system
 * component with no edges IS kept, because "nothing uses this" is the finding, not the absence of one.
 *
 * Done here rather than in `buildRelationshipGraph` because this is the layer that knows which files
 * are the design system; the pure graph reports everything it was given.
 */
function connectedNodes(graph: RelationshipGraph) {
  return graph.components.filter(
    (component) => component.designSystem || component.uses.length > 0 || component.importCount > 0,
  );
}

/** `index.toon` — what exists. The first thing a run reads. */
export function indexArtifact(
  graph: RelationshipGraph,
  shadows: ShadowFinding[],
  generatedAt: string,
  filesScanned: number,
): string {
  return writeToon({
    generatedAt,
    stats: {
      // "How many components do we have" counts the DESIGN SYSTEM, not the pages that consume it.
      components: connectedNodes(graph).filter((component) => component.designSystem).length,
      nodes: connectedNodes(graph).length,
      adopted: graph.components.filter((component) => component.adoption === "adopted").length,
      importedNeverRendered: graph.components.filter((c) => c.adoption === "imported-never-rendered").length,
      unimported: graph.components.filter((component) => component.adoption === "unimported").length,
      shadows: shadows.length,
      filesScanned,
      // Stated, not silent: a truncated scan that reported a component count would be a lie.
      truncated: filesScanned >= MAX_FILES,
    },
    components: connectedNodes(graph).map((component) => ({
      name: component.name,
      path: component.path,
      kind: component.designSystem ? "component" : "page",
      // Benchmark Q3 is "list all atoms used on that page" — unanswerable without this column.
      tier: component.tier ?? "",
      adoption: component.adoption,
      imports: component.importCount,
      instances: component.instanceCount,
      efficiency: component.efficiency ?? null,
    })),
  });
}

/** `component-usage.toon` — how components relate to each other, and where they were duplicated. */
export function usageArtifact(
  graph: RelationshipGraph,
  shadows: ShadowFinding[],
  generatedAt: string,
): string {
  return writeToon({
    generatedAt,
    usage: connectedNodes(graph).map((component) => ({
      name: component.name,
      // Joined with `|` so a list stays ONE cell: `,` is the row delimiter, and a list written with
      // it would silently become extra columns.
      uses: component.uses.join("|"),
      usedBy: component.usedBy.join("|"),
      importedBy: component.importedBy.join("|"),
    })),
    importedNeverRendered: graph.importedNeverRendered.map((entry) => ({
      component: entry.component,
      files: entry.files.join("|"),
    })),
    shadows: shadows.map((shadow) => ({
      component: shadow.component,
      file: shadow.file,
      overlap: shadow.overlap,
      sharedTokens: shadow.sharedTokens.join("|"),
    })),
  });
}

/** `design-tokens.toon` — the token↔component relationship, both directions (task 2.7 reads this). */
export function tokenArtifact(
  files: readonly GraphFile[],
  tokens: readonly { name: string; resolvedValue: string; type?: string }[],
  generatedAt: string,
): string {
  const known = new Set(tokens.map((token) => token.name));
  const consumers = new Map<string, Set<string>>();
  for (const file of files) {
    if (!file.component) continue;
    for (const token of tokensUsed(file.source)) {
      if (!known.has(token)) continue;
      (consumers.get(token) ?? consumers.set(token, new Set()).get(token)!).add(file.component);
    }
  }
  return writeToon({
    generatedAt,
    tokens: tokens.map((token) => ({
      name: token.name,
      value: token.resolvedValue,
      type: token.type ?? "",
      // The REVERSE index: token → the components that consume it. Answers "what breaks if I change
      // this token" without scanning a single component source.
      usedBy: [...(consumers.get(token.name) ?? [])].sort().join("|"),
      uses: (consumers.get(token.name) ?? new Set()).size,
    })),
  });
}

/** Read an artifact's `generatedAt`, or null when it has not been built. */
export async function readIndexStamp(projectPath: string): Promise<string | null> {
  const raw = await readFile(join(projectPath, INDEX_PATH), "utf8").catch(() => null);
  return raw?.match(/^generatedAt: (.+)$/m)?.[1]?.trim() ?? null;
}

export type { ToonValue };

// ── Reading the index back (task 2.7) ────────────────────────────────

/** One token's row in the reverse index. */
export interface TokenConsumers {
  token: string;
  value: string;
  type: string;
  /** Components that reference this token. */
  usedBy: string[];
}

/**
 * The token → components reverse index, read from `design-tokens.toon`.
 *
 * ANSWERS WITHOUT SCANNING COMPONENT SOURCES — which is the property task 2.7 asks to verify, and
 * the reason the artifact exists at all. "What breaks if I change `--radius-md`?" is otherwise a
 * full re-read of every component in the project, on every ask; here it is one file. The test for
 * this deletes the component sources after building the index and asserts the answer is unchanged,
 * because that is the only way to prove a read path is not quietly falling back to a scan.
 *
 * Returns null when the index has not been built. Null rather than building it on demand: a silent
 * rebuild inside a read would hide staleness (task 2.9) behind an answer that looks fresh.
 */
export async function readTokenIndex(projectPath: string): Promise<TokenConsumers[] | null> {
  const raw = await readFile(join(projectPath, TOKENS_PATH), "utf8").catch(() => null);
  if (raw === null) return null;
  let parsed: Record<string, ToonValue>;
  try {
    parsed = parseToon(raw);
  } catch {
    return null; // a corrupt artifact reads as "not built", never as "no tokens"
  }
  const rows = Array.isArray(parsed.tokens) ? (parsed.tokens as Record<string, ToonValue>[]) : [];
  return rows.map((row) => ({
    token: String(row.name ?? ""),
    value: String(row.value ?? ""),
    type: String(row.type ?? ""),
    usedBy: splitList(row.usedBy),
  }));
}

/** Which components consume a token. Empty when nothing does; null when the index is absent. */
export async function componentsUsingToken(
  projectPath: string,
  token: string,
): Promise<string[] | null> {
  const index = await readTokenIndex(projectPath);
  if (!index) return null;
  const bare = token.replace(/^--/, "");
  return index.find((row) => row.token === bare)?.usedBy ?? [];
}

/**
 * The FORWARD direction, derived from the same file: which tokens a component consumes.
 *
 * Derived rather than stored. Two copies of one relationship can disagree the moment either is
 * regenerated alone, and the reverse index already contains every pair — inverting it costs one
 * pass over a file we have just read.
 */
export async function tokensUsedByComponent(
  projectPath: string,
  component: string,
): Promise<string[] | null> {
  const index = await readTokenIndex(projectPath);
  if (!index) return null;
  return index
    .filter((row) => row.usedBy.includes(component))
    .map((row) => row.token)
    .sort();
}

/** A `|`-joined cell → its list. Empty string means an empty list, not a one-item list of "". */
function splitList(value: ToonValue): string[] {
  const text = typeof value === "string" ? value : "";
  return text ? text.split("|") : [];
}

// ── Staleness (task 2.9) ─────────────────────────────────────────────

export interface IndexStaleness {
  /** False when the index is current, or when it has never been built (see `built`). */
  stale: boolean;
  /** Whether an index exists at all. */
  built: boolean;
  generatedAt: string | null;
  /** Project-relative files changed since the index was generated, newest first. Capped. */
  changed: string[];
  /** How many changed in total — `changed` is capped, this is not. */
  changedCount: number;
  /** Ready to show a person, or to fail a CI job with. */
  message: string;
}

/** How many changed files are NAMED before the rest are counted. */
const STALE_NAMES_SHOWN = 10;

/**
 * Whether the index still describes the code — OpenSpec change: agentic-design-system, task 2.9.
 *
 * Compares each source file's mtime against the artifact's `generatedAt`. A stale index is worse
 * than no index: every reader treats it as authoritative, so a component added after the last build
 * reads as "does not exist" and an agent will happily create a duplicate. That is the false negative
 * the benchmark measures, arriving through the back door.
 *
 * NAMES the changed files rather than reporting a bare boolean, because "the index is stale" is not
 * actionable and "these four components changed" is.
 */
export async function indexStaleness(projectPath: string): Promise<IndexStaleness> {
  const generatedAt = await readIndexStamp(projectPath);
  if (!generatedAt)
    return {
      stale: false,
      built: false,
      generatedAt: null,
      changed: [],
      changedCount: 0,
      // Not stale — ABSENT. A caller that conflates the two would fail CI on every project that has
      // never opted into the index.
      message: "No design-system index has been built yet (.vortspec/ai/index.toon is absent).",
    };

  const stamp = Date.parse(generatedAt);
  const config = await readProjectConfig(projectPath);
  const files = await listSourceFiles(projectPath, config?.componentDir, config?.framework);
  const { stat } = await import("node:fs/promises");

  const changed: { path: string; mtime: number }[] = [];
  for (const relative of files) {
    const info = await stat(join(projectPath, relative)).catch(() => null);
    // FLOORED to the millisecond, because `generatedAt` is an ISO string and ISO has no
    // sub-millisecond precision. A file written at …991.4ms against a stamp of …991 would otherwise
    // read as newer than an index built after it — a freshly built index failing its own CI gate,
    // which is the worst kind of false positive: it teaches people to ignore the gate.
    if (info && Math.floor(info.mtimeMs) > stamp) changed.push({ path: relative, mtime: info.mtimeMs });
  }
  changed.sort((a, b) => b.mtime - a.mtime);
  const names = changed.slice(0, STALE_NAMES_SHOWN).map((entry) => entry.path);

  return {
    stale: changed.length > 0,
    built: true,
    generatedAt,
    changed: names,
    changedCount: changed.length,
    message: changed.length
      ? `The design-system index is stale: ${changed.length} file${changed.length === 1 ? "" : "s"} changed since ${generatedAt}` +
        ` (${names.join(", ")}${changed.length > names.length ? `, +${changed.length - names.length} more` : ""}).` +
        " Rebuild it so a run does not read a component that no longer matches its source."
      : `The design-system index is current (generated ${generatedAt}).`,
  };
}

/**
 * The CI gate. Exit-code semantics rather than a throw, so a workflow can call it directly.
 *
 * Returns 0 when the index is current OR absent, and 1 when it is stale. ABSENT PASSES on purpose:
 * a project that has not opted into the index has nothing to be out of date with, and failing there
 * would make every repo without one red for a reason its authors never chose.
 */
export async function checkIndexFreshness(
  projectPath: string,
): Promise<{ code: 0 | 1; message: string }> {
  const staleness = await indexStaleness(projectPath);
  return { code: staleness.stale ? 1 : 0, message: staleness.message };
}
