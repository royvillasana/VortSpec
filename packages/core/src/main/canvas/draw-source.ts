/**
 * Main-process orchestration for the Draw generate flow (docs/draw-to-component-graph.md). Impure
 * glue over the pure layers: it loads/mutates/saves the project graph, selects the grounding
 * subgraph, hydrates the referenced output from disk, and assembles the full sketch→component prompt.
 * The Draw window runs the returned prompt with the sketch PNG attached, then records the generation.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  addSketch,
  linkReference,
  buildIndex,
  selectSubgraph,
  recordGeneration,
  sketchId as sketchIdOf,
  type RefRole,
} from "../../shared/draw-graph";
import { renderSubgraphForPrompt, type SubgraphHydration } from "../../shared/subgraph-prompt";
import { buildDrawGeneratePrompt } from "../../shared/draw-generate";
import { lightPagePath } from "../../shared/light-page";
import { normSegment } from "../../shared/light-standin";
import { loadGraph, saveGraph } from "./canvas-store";

export interface DrawGenerateRequest {
  projectPath: string;
  /** Stable frame id for the sketch (re-using it across generations evolves the same sketch). */
  frameId: string;
  label: string;
  note?: string;
  /** Absolute path to the exported sketch PNG. */
  pngPath: string;
  /** Existing design-system components the user pinned as references (name + role). */
  references?: { name: string; role: RefRole }[];
  intent?: "create-new" | "customize-existing";
}

export interface DrawGenerateResult {
  prompt: string;
  /** Project-relative light-page path the agent writes to. */
  outputPath: string;
  /** The component/page name (slug). */
  name: string;
  /** The sketch node id (for recordDrawGeneration after the run). */
  sketchId: string;
}

/**
 * Persist the sketch + its references into the graph, then assemble the grounded generate prompt.
 * Idempotent per (frameId): re-running evolves the same sketch (recordDrawGeneration chains versions).
 */
export async function buildDrawGeneratePromptFor(req: DrawGenerateRequest): Promise<DrawGenerateResult> {
  const now = Date.now();
  const sketchId = sketchIdOf(req.frameId);
  const name = normSegment(req.label) || "sketch";
  const outputPath = lightPagePath(name);

  // Record the sketch (and any pinned references) in the graph so provenance + grounding are durable.
  let graph = await loadGraph(req.projectPath);
  graph = addSketch(graph, { frameId: req.frameId, label: req.label, note: req.note }, now);
  for (const ref of req.references ?? []) graph = linkReference(graph, sketchId, ref.name, ref.role, now);
  await saveGraph(req.projectPath, graph);

  // Select the grounding slice, then hydrate the referenced OUTPUT from disk (prior versions +
  // customize target) so a re-generate EDITS rather than restarts (the iterate loop).
  const ix = buildIndex(graph);
  const slice = selectSubgraph(ix, sketchId);
  const hydrated: SubgraphHydration = {};
  const priorHtml: Record<string, string> = {};
  for (const pv of slice.priorVersions) {
    if (!pv.outputRef) continue;
    const html = await readFile(pv.outputRef, "utf8").catch(() => null);
    if (html) priorHtml[pv.component] = html;
  }
  if (Object.keys(priorHtml).length) hydrated.priorHtml = priorHtml;
  if (slice.customizeTarget?.outputRef) {
    const html = await readFile(slice.customizeTarget.outputRef, "utf8").catch(() => null);
    if (html) hydrated.customizeHtml = html;
  }
  const subgraphBlock = renderSubgraphForPrompt(slice, hydrated);

  const prompt = buildDrawGeneratePrompt({
    name,
    outputPath,
    label: req.label,
    note: req.note,
    pngPath: req.pngPath,
    intent: req.intent ?? slice.intent,
    subgraphBlock,
  });

  return { prompt, outputPath, name, sketchId };
}

/**
 * Record a completed generation in the graph: create the Version, wire GENERATED/OF/EVOLVED_TO, and
 * persist the light-page output as the Version's outputRef. Returns the created version id.
 */
export async function recordDrawGenerationFor(input: {
  projectPath: string;
  sketchId: string;
  component: string;
  outputRef?: string;
}): Promise<string> {
  const graph = await loadGraph(input.projectPath);
  const outputRef = input.outputRef ?? join(input.projectPath, lightPagePath(normSegment(input.component) || "sketch"));
  const { graph: next, versionId } = recordGeneration(graph, {
    sketchId: input.sketchId,
    component: input.component,
    outputRef,
    status: "accepted",
    origin: "drawn",
    now: Date.now(),
  });
  await saveGraph(input.projectPath, next);
  return versionId;
}
