import { serve } from "inngest/next";
import { inngest, importPipeline } from "@vortspec/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [importPipeline],
});
