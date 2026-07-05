import { serve } from "inngest/next";
import { inngest, importPipeline, figmaImportPipeline } from "@vortspec/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [importPipeline, figmaImportPipeline],
});
