import { describe, it, expect } from "vitest";
import { setLLMConfig } from "../provider";

describe("LLM Provider", () => {
  it("setLLMConfig accepts configuration", () => {
    // Should not throw
    setLLMConfig({ apiKey: "test-key", models: ["test-model"] });
    expect(true).toBe(true);
  });

  it("setLLMConfig accepts empty config", () => {
    setLLMConfig({});
    expect(true).toBe(true);
  });
});
