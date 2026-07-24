import type { CheckStatus } from "@vortspec/core/ipc";

/**
 * Project-scoped Figma-MCP gate (change: figma-mcp-prerequisite, task 2.3).
 *
 * The environment check keeps the Figma MCP off the base `ready` gate (so
 * non-Figma work is never blocked). But for a project whose **design source is
 * Figma**, the Figma MCP is required — Claude can't read the design system
 * without it — so a not-connected MCP is a blocking gap for that project.
 *
 * Blocking iff the design source is Figma AND the MCP state is known and not
 * `pass`. An unknown/not-yet-loaded state (`null`/`undefined`) does not block,
 * so the gate never flashes before its data loads.
 */
export function figmaMcpBlocking(
  designSource: string | null | undefined,
  mcpStatus: CheckStatus | null | undefined,
): boolean {
  if (designSource !== "figma") return false;
  return mcpStatus != null && mcpStatus !== "pass";
}
