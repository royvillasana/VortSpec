import { defineWorkspace } from "vitest/config";

/**
 * Test suites are registered per app/package as they gain tests.
 * The v1 packages (ir/pipeline/llm/adapters/codegen) were removed in the
 * desktop pivot. The desktop app's main-process unit tests (Vitest) and the
 * AgentAdapter transcript-fixture tests land in D1.
 */
export default defineWorkspace([
  "apps/*/vitest.config.ts",
  "packages/*/vitest.config.ts",
]);
