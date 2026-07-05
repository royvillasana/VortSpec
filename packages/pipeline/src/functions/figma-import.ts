import { createClient } from "@supabase/supabase-js";
import { inngest } from "../client";
import { updateStageStatus, updateImportStatus } from "../lib/stage-status";
import { FigmaClient, mapVariablesToTokens, mapComponentSetToIR } from "@vortspec/adapters";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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

    // Stage 1: Discover — get file name + component node IDs (minimal output)
    const discovery = await step.run("discover", async () => {
      await updateStageStatus(importId, "discover", "running");
      try {
        const file = await client.getFile(fileKey, 1);
        const componentsRes = await client.getComponents(fileKey);
        const componentSetsRes = await client.getComponentSets(fileKey);

        // Extract ONLY the node IDs and names — keep step output small
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

        // Return only IDs and names — NOT full metadata
        return { fileName: file.name, componentIds, componentSetIds };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "discover", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 2: Extract Variables → tokens, persist directly to DB
    const tokenCount = await step.run("extract_variables", async () => {
      await updateStageStatus(importId, "extract_variables", "running");
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tokens: any[] = [];
        let varMapObj: Record<string, string> = {};

        try {
          const variables = await client.getVariables(fileKey);
          const result = mapVariablesToTokens(variables);
          tokens = result.tokens;
          varMapObj = Object.fromEntries(result.variableIdToTokenId);
        } catch {
          console.warn("[figma] Variables not available");
        }

        // Persist tokens directly to DB (don't pass through step output)
        const supabase = getSupabase();
        for (const token of tokens) {
          await supabase.from("tokens").insert({ project_id: projectId, doc: token });
        }

        await updateStageStatus(importId, "extract_variables", "done", {
          result: { tokenCount: tokens.length },
        });

        // Return only the count + varMap (small)
        return { count: tokens.length, varMap: varMapObj };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "extract_variables", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 3: Extract Components — fetch nodes, map to IR, persist directly to DB
    const componentCount = await step.run("extract_components", async () => {
      await updateStageStatus(importId, "extract_components", "running");
      try {
        // Only fetch published component sets (the curated, reusable components)
        // Skip standalone components — in a large file (6000+), most are internal
        // variants, sub-components, or deprecated items
        const nodeIdsToFetch = discovery.componentSetIds.map((cs) => cs.nodeId);

        if (nodeIdsToFetch.length === 0) {
          await updateStageStatus(importId, "extract_components", "done", {
            result: { componentCount: 0 },
          });
          return { count: 0 };
        }

        const nodesResponse = await client.getNodes(fileKey, nodeIdsToFetch);
        const varMap = new Map<string, string>(
          Object.entries(tokenCount.varMap || {}).map(([k, v]) => [k, String(v)]),
        );

        const supabase = getSupabase();
        let count = 0;

        for (const [, nodeData] of Object.entries(nodesResponse.nodes || {})) {
          if (!nodeData) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const node = (nodeData as any).document;
          if (!node) continue;

          try {
            const children = node.children ?? [];
            const ir = mapComponentSetToIR(node, children, varMap);

            // Persist directly to DB
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

        await updateStageStatus(importId, "extract_components", "done", {
          result: { componentCount: count },
        });

        return { count };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "extract_components", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 4: Report — mark done with final counts
    await step.run("report", async () => {
      await updateStageStatus(importId, "report", "running");
      try {
        await updateStageStatus(importId, "report", "done", {
          result: {
            tokenCount: tokenCount.count,
            componentCount: componentCount.count,
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
