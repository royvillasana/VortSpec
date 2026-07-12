import { describe, it, expect } from "vitest";
import { buildDoctorPrompt, buildEnvSetupPrompt, relFileFromSource } from "./doctor";

describe("relFileFromSource", () => {
  it("derives a project-relative path from a dev-server URL", () => {
    expect(relFileFromSource("http://localhost:8080/src/lib/supabase/client.ts?v=abc")).toBe(
      "src/lib/supabase/client.ts",
    );
  });
  it("returns null for no source", () => {
    expect(relFileFromSource(undefined)).toBeNull();
  });
});

describe("buildDoctorPrompt", () => {
  it("includes the error and the failing file", () => {
    const p = buildDoctorPrompt({
      kind: "runtime",
      error: "Invalid supabaseUrl: Provided URL is malformed.",
      file: "src/lib/supabase/client.ts",
      script: "dev",
    });
    expect(p).toContain("failed to run");
    expect(p).toContain("src/lib/supabase/client.ts");
    expect(p).toContain("Invalid supabaseUrl");
  });

  it("forbids inventing secrets", () => {
    const p = buildDoctorPrompt({ kind: "startup", error: "boom" });
    expect(p.toLowerCase()).toContain("never fabricate secrets");
    expect(p).toContain(".env");
  });
});

describe("buildEnvSetupPrompt", () => {
  it("offers to create .env from the example and lists placeholders", () => {
    const p = buildEnvSetupPrompt({ hasEnv: false, example: ".env.example", placeholders: ["SUPABASE_URL"] });
    expect(p).toContain(".env.example");
    expect(p).toContain("no `.env` file yet");
    expect(p).toContain("SUPABASE_URL");
  });

  it("never fabricates secrets", () => {
    const p = buildEnvSetupPrompt({ hasEnv: true });
    expect(p.toLowerCase()).toContain("never fabricate secrets");
    expect(p).toContain("A `.env` file exists.");
  });
});
