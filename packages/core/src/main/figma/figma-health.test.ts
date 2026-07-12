import { describe, it, expect } from "vitest";
import { classifyFigmaHealth, extractVerdict, figmaHealthPrompt } from "./figma-health";

describe("classifyFigmaHealth", () => {
  it("maps token-expired to the OAuth-MCP switch (token/console kept as fallback)", () => {
    const h = classifyFigmaHealth({ failureMode: "token-expired", detail: "REST 403" });
    expect(h.mode).toBe("token-expired");
    expect(h.tokenValid).toBe(false);
    expect(h.canRead).toBe(false);
    expect(h.message).toMatch(/token expired/i);
    // Leads with the recommended OAuth MCP…
    expect(h.message).toMatch(/official Figma MCP/);
    expect(h.message).toMatch(/mcp\.figma\.com/);
    // …and offers the figma-console token refresh as the fallback.
    expect(h.message).toMatch(/Settings → Figma API token/);
  });

  it("maps bridge-down to the OAuth-MCP switch (Desktop Bridge as fallback)", () => {
    const h = classifyFigmaHealth({ failureMode: "bridge-down" });
    expect(h.mode).toBe("bridge-down");
    expect(h.bridgeConnected).toBe(false);
    expect(h.message).toMatch(/official Figma MCP/);
    expect(h.message).toMatch(/mcp\.figma\.com/);
    expect(h.message).toMatch(/Desktop Bridge/);
  });

  it("recommends the OAuth MCP when nothing is configured", () => {
    const h = classifyFigmaHealth({ failureMode: "not-configured" });
    expect(h.message).toMatch(/official Figma MCP/);
    expect(h.message).toMatch(/mcp\.figma\.com/);
  });

  it("reports a healthy connection with counts", () => {
    const h = classifyFigmaHealth({
      failureMode: "ok",
      tokenValid: true,
      bridgeConnected: true,
      canReadVariablesAndStyles: true,
      variableCount: 80,
      styleCount: 12,
    });
    expect(h.mode).toBe("ok");
    expect(h.canRead).toBe(true);
    expect(h.variableCount).toBe(80);
    expect(h.message).toMatch(/80 variables and 12 styles/);
  });

  it("defaults to unknown for a garbled verdict, keeping the detail", () => {
    const h = classifyFigmaHealth({ failureMode: "banana", detail: "weird" });
    expect(h.mode).toBe("unknown");
    expect(h.message).toMatch(/weird/);
  });

  it("tolerates a null/empty verdict", () => {
    expect(classifyFigmaHealth(null).mode).toBe("unknown");
    expect(classifyFigmaHealth(undefined).variableCount).toBe(0);
  });
});

describe("extractVerdict", () => {
  it("pulls the verdict out of a --output-format json envelope", () => {
    const envelope = JSON.stringify({
      type: "result",
      result: 'Here is the result:\n{"failureMode":"token-expired","tokenValid":false,"detail":"403"}',
    });
    const v = extractVerdict(envelope) as { failureMode: string };
    expect(v.failureMode).toBe("token-expired");
  });

  it("pulls the verdict from raw text without an envelope", () => {
    const v = extractVerdict('noise {"failureMode":"ok","variableCount":5} trailing') as {
      failureMode: string;
      variableCount: number;
    };
    expect(v.failureMode).toBe("ok");
    expect(v.variableCount).toBe(5);
  });

  it("returns null when there is no verdict", () => {
    expect(extractVerdict("just some logs, no json")).toBeNull();
    expect(extractVerdict("")).toBeNull();
  });
});

describe("figmaHealthPrompt", () => {
  it("is read-only, prefers the remote MCP, and asks for variables + styles", () => {
    const p = figmaHealthPrompt("https://figma.com/design/ABC");
    expect(p).toMatch(/READ-ONLY/);
    expect(p).toMatch(/Do NOT modify/);
    expect(p).toMatch(/VARIABLES and text\/color STYLES/);
    expect(p).toContain("https://figma.com/design/ABC");
    // Prefers the OAuth remote MCP and never requires a live selection.
    expect(p).toMatch(/PREFER the official remote Figma MCP/);
    expect(p).toMatch(/mcp\.figma\.com/);
    expect(p).toMatch(/rely on a live layer selection/i);
    // A working remote MCP means OK even if the local Desktop Bridge is down.
    expect(p).toMatch(/a working remote MCP wins/);
  });
});
