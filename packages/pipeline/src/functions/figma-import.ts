import { createClient } from "@supabase/supabase-js";
import { inngest } from "../client";
import { updateStageStatus, updateImportStatus } from "../lib/stage-status";
import { FigmaClient, mapVariablesToTokens, mapComponentSetToIR, mineFills } from "@vortspec/adapters";

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

    // Stage 1: Discover — read the file tree
    const fileData = await step.run("discover", async () => {
      await updateStageStatus(importId, "discover", "running");
      try {
        const file = await client.getFile(fileKey);
        await updateStageStatus(importId, "discover", "done", {
          result: { pageCount: file.document.children?.length ?? 0 },
        });
        // Return serializable data
        return JSON.parse(JSON.stringify({ document: file.document, name: file.name }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "discover", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 2: Extract Variables → tokens
    const tokenData = await step.run("extract_variables", async () => {
      await updateStageStatus(importId, "extract_variables", "running");
      try {
        let tokenList: unknown[];
        let varMap: Record<string, string> = {};

        try {
          const variables = await client.getVariables(fileKey);
          const result = mapVariablesToTokens(variables);
          tokenList = result.tokens;
          // Convert Map to plain object for serialization
          varMap = Object.fromEntries(result.variableIdToTokenId);
        } catch {
          console.warn("[figma] Variables not available, mining fills");
          tokenList = mineFills(fileData.document);
        }

        await updateStageStatus(importId, "extract_variables", "done", {
          result: { tokenCount: tokenList.length },
        });
        return JSON.parse(JSON.stringify({ tokens: tokenList, varMap }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "extract_variables", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 3: Extract Components
    const componentData = await step.run("extract_components", async () => {
      await updateStageStatus(importId, "extract_components", "running");
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function findNodes(node: any, types: string[]): any[] {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any[] = [];
          if (types.includes(node.type)) results.push(node);
          if (node.children) {
            for (const child of node.children) results.push(...findNodes(child, types));
          }
          return results;
        }

        const allNodes = findNodes(fileData.document, ["COMPONENT_SET", "COMPONENT"]);

        // Filter: component sets + standalone components (not variant children)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const topLevel = allNodes.filter((n: any) => {
          if (n.type === "COMPONENT_SET") return true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const isVariant = allNodes.some((cs: any) =>
            cs.type === "COMPONENT_SET" && cs.children?.some((c: any) => c.id === n.id),
          );
          return !isVariant;
        });

        const varMapObj = tokenData.varMap as Record<string, string>;
        const varMap = new Map(Object.entries(varMapObj));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const componentIRs = topLevel.map((n: any) => {
          const children = n.children ?? [];
          return mapComponentSetToIR(n, children, varMap);
        });

        await updateStageStatus(importId, "extract_components", "done", {
          result: { componentCount: componentIRs.length },
        });
        return JSON.parse(JSON.stringify(componentIRs));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "extract_components", "failed", { error: msg });
        await updateImportStatus(importId, "failed", msg);
        throw err;
      }
    });

    // Stage 4: Report — persist to DB
    await step.run("report", async () => {
      await updateStageStatus(importId, "report", "running");
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const tokens = tokenData.tokens as unknown[];
        const components = componentData as unknown[];

        for (const token of tokens) {
          await supabase.from("tokens").insert({ project_id: projectId, doc: token });
        }

        for (const comp of components) {
          await supabase.from("components").insert({
            project_id: projectId,
            doc: comp,
            status: "normalized",
            version: 1,
          });
        }

        let issueCount = 0;
        for (const comp of components) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          issueCount += (comp as any).completeness?.issues?.length ?? 0;
        }

        await updateStageStatus(importId, "report", "done", {
          result: { tokenCount: tokens.length, componentCount: components.length, issueCount },
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
