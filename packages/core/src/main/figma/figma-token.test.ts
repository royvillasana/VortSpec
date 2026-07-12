import { describe, it, expect } from "vitest";
import {
  findFigmaTokenServer,
  figmaTokenStatusFrom,
  buildUpdatedServerSpec,
} from "./figma-token";

const CONFIG = {
  mcpServers: {
    pencil: { command: "/bin/pencil", args: [] },
    "figma-console": {
      type: "stdio",
      command: "npx",
      args: ["-y", "figma-console-mcp@latest"],
      env: { FIGMA_ACCESS_TOKEN: "figd_secret", ENABLE_MCP_APPS: "true" },
    },
  },
};

describe("findFigmaTokenServer", () => {
  it("finds the server carrying a Figma token env var", () => {
    const f = findFigmaTokenServer(CONFIG);
    expect(f?.name).toBe("figma-console");
    expect(f?.envVar).toBe("FIGMA_ACCESS_TOKEN");
  });

  it("falls back to a figma-named server with a default env var", () => {
    const f = findFigmaTokenServer({
      mcpServers: { figma: { command: "npx", args: ["figma-mcp"], env: {} } },
    });
    expect(f?.name).toBe("figma");
    expect(f?.envVar).toBe("FIGMA_ACCESS_TOKEN");
  });

  it("returns null when no Figma server is present", () => {
    expect(findFigmaTokenServer({ mcpServers: { pencil: { command: "x" } } })).toBeNull();
    expect(findFigmaTokenServer(null)).toBeNull();
    expect(findFigmaTokenServer({})).toBeNull();
  });
});

describe("figmaTokenStatusFrom", () => {
  it("reports a configured token WITHOUT exposing its value", () => {
    const s = figmaTokenStatusFrom(CONFIG);
    expect(s.configured).toBe(true);
    expect(s.serverName).toBe("figma-console");
    expect(s.envVar).toBe("FIGMA_ACCESS_TOKEN");
    // The value must never leak into the status.
    expect(JSON.stringify(s)).not.toContain("figd_secret");
  });

  it("reports not-configured when the token env var is empty", () => {
    const s = figmaTokenStatusFrom({
      mcpServers: { "figma-console": { command: "npx", args: [], env: { FIGMA_ACCESS_TOKEN: "" } } },
    });
    expect(s.configured).toBe(false);
    expect(s.serverName).toBe("figma-console");
  });

  it("reports no server when there's nothing to update", () => {
    const s = figmaTokenStatusFrom({ mcpServers: {} });
    expect(s.configured).toBe(false);
    expect(s.serverName).toBeNull();
  });
});

describe("buildUpdatedServerSpec", () => {
  it("swaps in the new token and preserves the rest of the spec", () => {
    const spec = CONFIG.mcpServers["figma-console"];
    const next = buildUpdatedServerSpec(spec, "FIGMA_ACCESS_TOKEN", "figd_new");
    expect(next.env?.FIGMA_ACCESS_TOKEN).toBe("figd_new");
    expect(next.env?.ENABLE_MCP_APPS).toBe("true"); // preserved
    expect(next.command).toBe("npx");
    expect(next.args).toEqual(["-y", "figma-console-mcp@latest"]);
    // The original is not mutated.
    expect(spec.env.FIGMA_ACCESS_TOKEN).toBe("figd_secret");
  });
});
