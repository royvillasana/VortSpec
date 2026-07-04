import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "../client";
import { updateStageStatus, updateImportStatus } from "../lib/stage-status";
import { runParseStage } from "../stages/parse";
import { runStyleMiningCore, type StyleMiningResult } from "../stages/style-mining";
import { runStructureInferenceCore, type StructureInferenceResult } from "../stages/structure-inference";
import { runReportCore, type ReportResult } from "../stages/report";

/**
 * Download a ZIP from Supabase storage and extract text files.
 */
async function extractFilesFromStorage(
  storagePath: string,
): Promise<Array<{ path: string; content: string }>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: blob, error } = await supabase.storage
    .from("imports")
    .download(storagePath);

  if (error || !blob) {
    throw new Error(`Failed to download ZIP: ${error?.message ?? "not found"}`);
  }

  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const files: Array<{ path: string; content: string }> = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = path.toLowerCase();
    if (
      lower.endsWith(".css") ||
      lower.endsWith(".html") ||
      lower.endsWith(".htm")
    ) {
      files.push({ path, content: await entry.async("text") });
    }
  }

  return files;
}

export const importPipeline = inngest.createFunction(
  { id: "import-pipeline", name: "Import Pipeline" },
  { event: "import/started" },
  async ({ event, step }) => {
    const { importId, projectId, storagePath } = event.data as {
      importId: string;
      projectId: string;
      sourceId: string;
      storagePath: string;
    };

    // Stage 1: Parse
    const parseResult = await step.run("parse", async () => {
      await updateStageStatus(importId, "parse", "running");
      try {
        const result = await runParseStage(storagePath);
        await updateStageStatus(importId, "parse", "done", {
          result: result as unknown as Record<string, unknown>,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "parse", "failed", {
          error: message,
        });
        await updateImportStatus(importId, "failed", message);
        throw err;
      }
    });

    // Extract files from ZIP (shared between stages 2 and 4)
    const files = await step.run("extract_files", async () => {
      return extractFilesFromStorage(storagePath);
    });

    // Stage 2: Style Mining
    const styleMiningResult = await step.run("style_mining", async () => {
      await updateStageStatus(importId, "style_mining", "running");
      try {
        const result = runStyleMiningCore(files);
        await updateStageStatus(importId, "style_mining", "done", {
          result: {
            totalDeclarations: result.totalDeclarations,
            uniqueValues: result.uniqueValues,
            groupCount: result.groups.length,
          },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "style_mining", "failed", {
          error: message,
        });
        await updateImportStatus(importId, "failed", message);
        throw err;
      }
    });

    // Stage 3: Token Inference (STUB -- tokens are promoted in report stage)
    await step.run("token_inference", async () => {
      await updateStageStatus(importId, "token_inference", "running");
      await updateStageStatus(importId, "token_inference", "done", {
        result: { tokenCount: 0, note: "Token promotion handled in report stage" },
      });
    });

    // Stage 4: Structure Inference
    const structureResult = await step.run("structure_inference", async () => {
      await updateStageStatus(importId, "structure_inference", "running");
      try {
        const result = runStructureInferenceCore(files, styleMiningResult.groups);
        await updateStageStatus(importId, "structure_inference", "done", {
          result: {
            componentCount: result.components.length,
            candidateCount: result.candidateCount,
          },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "structure_inference", "failed", {
          error: message,
        });
        await updateImportStatus(importId, "failed", message);
        throw err;
      }
    });

    // Stage 5: DS Merge (STUB)
    await step.run("ds_merge", async () => {
      await updateStageStatus(importId, "ds_merge", "running");
      await updateStageStatus(importId, "ds_merge", "done", {
        result: { conflictCount: 0 },
      });
    });

    // Stage 6: Report
    const reportResult = await step.run("report", async () => {
      await updateStageStatus(importId, "report", "running");
      try {
        const result = runReportCore(
          structureResult.components,
          styleMiningResult.groups,
        );

        // Persist to Supabase
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        for (const token of result.tokens) {
          await supabase.from("tokens").insert({
            project_id: projectId,
            doc: token,
          });
        }

        for (const component of result.components) {
          await supabase.from("components").insert({
            project_id: projectId,
            doc: component,
            status: "normalized",
            version: 1,
          });
        }

        await updateStageStatus(importId, "report", "done", {
          result: {
            tokenCount: result.summary.tokenCount,
            componentCount: result.summary.componentCount,
            issueCount: result.summary.issueCount,
            htmlFiles: parseResult.htmlFiles,
            cssFiles: parseResult.cssFiles,
            nodeCount: parseResult.nodeCount,
          },
        });
        await updateImportStatus(importId, "done");

        return result.summary;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateStageStatus(importId, "report", "failed", {
          error: message,
        });
        await updateImportStatus(importId, "failed", message);
        throw err;
      }
    });

    return { success: true, parseResult, reportResult };
  },
);
