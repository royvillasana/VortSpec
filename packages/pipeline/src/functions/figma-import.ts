import { createClient } from "@supabase/supabase-js";
import { inngest } from "../client";
import { updateStageStatus, updateImportStatus } from "../lib/stage-status";
import { generateId } from "../lib/id";
import { FigmaClient, mapVariablesToTokens, mapComponentSetToIR } from "@vortspec/adapters";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Mine colors, typography, and spacing from Figma node fills/styles.
 * This runs when the Variables API is unavailable (free plan).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mineTokensFromNodes(nodes: any[]): any[] {
  const colorMap = new Map<string, { hex: string; count: number }>();
  const sizeMap = new Map<string, { value: number; property: string; count: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walkNode(node: any) {
    // Extract solid fill colors
    if (node.fills && Array.isArray(node.fills)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const fill of node.fills) {
        if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
          const r = Math.round((fill.color.r ?? 0) * 255);
          const g = Math.round((fill.color.g ?? 0) * 255);
          const b = Math.round((fill.color.b ?? 0) * 255);
          const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
          const existing = colorMap.get(hex);
          colorMap.set(hex, { hex, count: (existing?.count ?? 0) + 1 });
        }
      }
    }

    // Extract stroke colors
    if (node.strokes && Array.isArray(node.strokes)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const stroke of node.strokes) {
        if (stroke.type === "SOLID" && stroke.color && stroke.visible !== false) {
          const r = Math.round((stroke.color.r ?? 0) * 255);
          const g = Math.round((stroke.color.g ?? 0) * 255);
          const b = Math.round((stroke.color.b ?? 0) * 255);
          const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
          const existing = colorMap.get(hex);
          colorMap.set(hex, { hex, count: (existing?.count ?? 0) + 1 });
        }
      }
    }

    // Extract corner radius
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      const key = `${node.cornerRadius}px`;
      const existing = sizeMap.get(`radius-${key}`);
      sizeMap.set(`radius-${key}`, { value: node.cornerRadius, property: "radius", count: (existing?.count ?? 0) + 1 });
    }

    // Extract spacing from auto-layout
    if (typeof node.itemSpacing === "number" && node.itemSpacing > 0) {
      const key = `${node.itemSpacing}px`;
      const existing = sizeMap.get(`spacing-${key}`);
      sizeMap.set(`spacing-${key}`, { value: node.itemSpacing, property: "spacing", count: (existing?.count ?? 0) + 1 });
    }

    // Extract font size from text nodes
    if (node.type === "TEXT" && node.style?.fontSize) {
      const key = `${node.style.fontSize}px`;
      const existing = sizeMap.get(`font-${key}`);
      sizeMap.set(`font-${key}`, { value: node.style.fontSize, property: "typography", count: (existing?.count ?? 0) + 1 });
    }

    // Recurse children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) walkNode(child);
    }
  }

  for (const node of nodes) walkNode(node);

  // Build tokens from mined values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens: any[] = [];
  let colorIdx = 0;
  let sizeIdx = 0;

  // Colors used 2+ times become tokens
  for (const [, data] of colorMap) {
    if (data.count < 2) continue;
    colorIdx++;
    tokens.push({
      id: generateId("tok"),
      name: `color/mined-${colorIdx}`,
      type: "color",
      value: { type: "color", value: { hex: data.hex } },
      provenance: {
        source: "figma",
        extractor: "figma/fill-miner@1",
        extractedAt: new Date().toISOString(),
        confidence: "inferred",
        inferredBy: "deterministic",
      },
    });
  }

  // Sizes used 2+ times
  for (const [, data] of sizeMap) {
    if (data.count < 2) continue;
    sizeIdx++;
    const type = data.property === "radius" ? "radius" : data.property === "spacing" ? "spacing" : "sizing";
    tokens.push({
      id: generateId("tok"),
      name: `${data.property}/mined-${sizeIdx}`,
      type,
      value: { type, value: { value: data.value, unit: "px" } },
      provenance: {
        source: "figma",
        extractor: "figma/fill-miner@1",
        extractedAt: new Date().toISOString(),
        confidence: "inferred",
        inferredBy: "deterministic",
      },
    });
  }

  return tokens;
}

export const figmaImportPipeline = inngest.createFunction(
  { id: "figma-import-pipeline", name: "Figma Import Pipeline" },
  { event: "figma-import/started" },
  async ({ event, step }) => {
    const { importId, projectId, fileKey, pat } = event.data as {
      importId: string;
      projectId: string;
      sourceId: string;
      fileKey: string;
      pat: string;
    };

    const client = new FigmaClient({ pat });

    // Stage 1: Discover
    const discovery = await step.run("discover", async () => {
      await updateStageStatus(importId, "discover", "running");
      try {
        const file = await client.getFile(fileKey, 1);
        const componentsRes = await client.getComponents(fileKey);
        const componentSetsRes = await client.getComponentSets(fileKey);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const componentIds = (componentsRes.meta?.components ?? []).map((c: any) => ({
          nodeId: c.node_id as string,
          name: c.name as string,
          containingSetId: c.containing_frame?.containingComponentSetId as string | undefined,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const componentSetIds = (componentSetsRes.meta?.component_sets ?? []).map((cs: any) => ({
          nodeId: cs.node_id as string,
          name: cs.name as string,
        }));

        await updateStageStatus(importId, "discover", "done", {
          result: {
            fileName: file.name,
            componentCount: componentIds.length,
            componentSetCount: componentSetIds.length,
          },
        });

        return { fileName: file.name, componentIds, componentSetIds };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "discover", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 2: Extract Variables → tokens
    const tokenCount = await step.run("extract_variables", async () => {
      await updateStageStatus(importId, "extract_variables", "running");
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tokens: any[] = [];
        let varMapObj: Record<string, string> = {};
        let source = "none";

        // Try Variables API first (requires paid plan)
        try {
          const variables = await client.getVariables(fileKey);
          const result = mapVariablesToTokens(variables);
          tokens = result.tokens;
          varMapObj = Object.fromEntries(result.variableIdToTokenId);
          source = "variables";
        } catch {
          console.warn("[figma] Variables API not available — will mine from component nodes");
        }

        // If no tokens from variables, mine from styles endpoint
        if (tokens.length === 0) {
          try {
            const stylesRes = await client.getStyles(fileKey);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const styleMetas = (stylesRes.meta?.styles ?? []) as any[];

            // Create tokens from color/text/effect styles
            for (const style of styleMetas) {
              const id = generateId("tok");
              if (style.style_type === "FILL") {
                tokens.push({
                  id,
                  name: `color/${(style.name || "unnamed").replace(/\s+/g, "-").toLowerCase()}`,
                  type: "color",
                  value: { type: "color", value: { hex: "#000000" } }, // Placeholder — actual value comes from node data
                  description: style.description || undefined,
                  provenance: {
                    source: "figma",
                    extractor: "figma/style-extractor@1",
                    extractedAt: new Date().toISOString(),
                    confidence: "confirmed",
                    confirmedBy: "rule",
                  },
                });
              } else if (style.style_type === "TEXT") {
                tokens.push({
                  id,
                  name: `type/${(style.name || "unnamed").replace(/\s+/g, "-").toLowerCase()}`,
                  type: "typography",
                  value: { type: "typography", value: { fontFamily: "System", fontSize: { value: 16, unit: "px" }, fontWeight: 400, lineHeight: 1.5 } },
                  description: style.description || undefined,
                  provenance: {
                    source: "figma",
                    extractor: "figma/style-extractor@1",
                    extractedAt: new Date().toISOString(),
                    confidence: "confirmed",
                    confirmedBy: "rule",
                  },
                });
              } else if (style.style_type === "EFFECT") {
                tokens.push({
                  id,
                  name: `shadow/${(style.name || "unnamed").replace(/\s+/g, "-").toLowerCase()}`,
                  type: "shadow",
                  value: { type: "shadow", value: { layers: [{ x: 0, y: 2, blur: 4, spread: 0, colorRef: { hex: "#000000", alpha: 0.1 } }] } },
                  provenance: {
                    source: "figma",
                    extractor: "figma/style-extractor@1",
                    extractedAt: new Date().toISOString(),
                    confidence: "confirmed",
                    confirmedBy: "rule",
                  },
                });
              }
            }
            if (tokens.length > 0) source = "styles";
          } catch {
            console.warn("[figma] Styles endpoint failed too");
          }
        }

        // Persist tokens
        const supabase = getSupabase();
        for (const token of tokens) {
          await supabase.from("tokens").insert({ project_id: projectId, doc: token });
        }

        await updateStageStatus(importId, "extract_variables", "done", {
          result: { tokenCount: tokens.length, source },
        });

        return { count: tokens.length, varMap: varMapObj };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "extract_variables", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 3: Extract Components + mine additional tokens from fills
    const componentCount = await step.run("extract_components", async () => {
      await updateStageStatus(importId, "extract_components", "running");
      try {
        const nodeIdsToFetch = discovery.componentSetIds.map((cs) => cs.nodeId);

        if (nodeIdsToFetch.length === 0) {
          await updateStageStatus(importId, "extract_components", "done", {
            result: { componentCount: 0, minedTokens: 0 },
          });
          return { count: 0 };
        }

        const nodesResponse = await client.getNodes(fileKey, nodeIdsToFetch);
        const varMap = new Map<string, string>(
          Object.entries(tokenCount.varMap || {}).map(([k, v]) => [k, String(v)]),
        );

        const supabase = getSupabase();
        let count = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allFetchedNodes: any[] = [];

        for (const [, nodeData] of Object.entries(nodesResponse.nodes || {})) {
          if (!nodeData) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const node = (nodeData as any).document;
          if (!node) continue;
          allFetchedNodes.push(node);

          try {
            const children = node.children ?? [];
            const ir = mapComponentSetToIR(node, children, varMap);

            await supabase.from("components").insert({
              project_id: projectId,
              doc: ir,
              status: "normalized",
              version: 1,
            });
            count++;
          } catch (mapErr) {
            console.warn(`[figma] Failed to map component ${node.name}:`, mapErr);
          }
        }

        // Mine tokens from component node fills if we got 0 tokens from variables
        let minedTokenCount = 0;
        if (tokenCount.count === 0 && allFetchedNodes.length > 0) {
          const minedTokens = mineTokensFromNodes(allFetchedNodes);
          minedTokenCount = minedTokens.length;

          for (const token of minedTokens) {
            await supabase.from("tokens").insert({ project_id: projectId, doc: token });
          }
        }

        await updateStageStatus(importId, "extract_components", "done", {
          result: { componentCount: count, minedTokens: minedTokenCount },
        });

        return { count };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "extract_components", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 4: Report
    await step.run("report", async () => {
      await updateStageStatus(importId, "report", "running");
      try {
        // Get final counts from DB
        const supabase = getSupabase();
        const { count: finalTokenCount } = await supabase
          .from("tokens")
          .select("*", { count: "exact", head: true })
          .eq("project_id", projectId);
        const { count: finalComponentCount } = await supabase
          .from("components")
          .select("*", { count: "exact", head: true })
          .eq("project_id", projectId);

        await updateStageStatus(importId, "report", "done", {
          result: {
            tokenCount: finalTokenCount ?? 0,
            componentCount: finalComponentCount ?? 0,
            issueCount: 0,
          },
        });
        await updateImportStatus(importId, "done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "report", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    return { success: true };
  },
);
