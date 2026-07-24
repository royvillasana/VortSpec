import { describe, it, expect } from "vitest";
import { figmaMcpBlocking } from "./figma-mcp-gate";

describe("figmaMcpBlocking", () => {
  it("blocks a Figma-source project when the MCP is not connected", () => {
    expect(figmaMcpBlocking("figma", "fail")).toBe(true); // configured, needs auth
    expect(figmaMcpBlocking("figma", "unknown")).toBe(true); // not configured
    expect(figmaMcpBlocking("figma", "checking")).toBe(true); // mid re-verify
  });

  it("never blocks once the Figma MCP is connected", () => {
    expect(figmaMcpBlocking("figma", "pass")).toBe(false);
  });

  it("never blocks a non-Figma design source, regardless of MCP state", () => {
    expect(figmaMcpBlocking("library", "fail")).toBe(false);
    expect(figmaMcpBlocking("github", "unknown")).toBe(false);
    expect(figmaMcpBlocking(null, "fail")).toBe(false);
    expect(figmaMcpBlocking(undefined, "unknown")).toBe(false);
  });

  it("does not block before the MCP state has loaded (no flash)", () => {
    expect(figmaMcpBlocking("figma", null)).toBe(false);
    expect(figmaMcpBlocking("figma", undefined)).toBe(false);
  });
});
