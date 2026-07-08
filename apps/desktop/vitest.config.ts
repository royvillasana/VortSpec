import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Unit suites now live in @vortspec/core and @vortspec/ui; the cockpit keeps
    // only its Playwright component tests (test:ct). Don't fail on zero units.
    passWithNoTests: true,
  },
});
