import { describe, it, expect } from "vitest";
import { classifyFigmaHealth, extractVerdict, figmaHealthPrompt } from "./figma-health";

describe("classifyFigmaHealth", () => {
  it("maps token-expired to a token-update fix (and marks the token invalid)", () => {
    const h = classifyFigmaHealth({ failureMode: "token-expired", detail: "REST 403" });
    expect(h.mode).toBe("token-expired");
    expect(h.tokenValid).toBe(false);
    expect(h.canRead).toBe(false);
    expect(h.message).toMatch(/token has expired/i);
    expect(h.message).toMatch(/personal access token/i);
  });

  it("maps bridge-down to an 'open the Desktop Bridge' fix", () => {
    const h = classifyFigmaHealth({ failureMode: "bridge-down" });
    expect(h.mode).toBe("bridge-down");
    expect(h.bridgeConnected).toBe(false);
    expect(h.message).toMatch(/Desktop Bridge/);
    expect(h.message).toMatch(/Open Figma Desktop/i);
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
  it("is read-only and asks for both variables and styles", () => {
    const p = figmaHealthPrompt("https://figma.com/design/ABC");
    expect(p).toMatch(/READ-ONLY/);
    expect(p).toMatch(/Do NOT modify/);
    expect(p).toMatch(/VARIABLES and text\/color STYLES/);
    expect(p).toContain("https://figma.com/design/ABC");
    // Must not require a live selection (the exact failure we're diagnosing).
    expect(p).toMatch(/do NOT rely on a live layer selection/i);
  });
});
