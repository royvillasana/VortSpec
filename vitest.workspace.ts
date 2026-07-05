import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/ir/vitest.config.ts",
  "packages/pipeline/vitest.config.ts",
  "packages/llm/vitest.config.ts",
  "packages/adapters/vitest.config.ts",
  "packages/codegen/vitest.config.ts",
]);
