import { z } from "zod";

/**
 * Contracts for the VortSpec IDE MCP integration (IDE app only).
 *
 * The assistant's headless Claude gets a stdio MCP server (`mcp__vortspec-ide__*`)
 * via `--mcp-config`. Its tool calls reach the main-process bridge, which:
 *  - answers reads (`get_*`) from a cache the renderer keeps fresh via
 *    `ide:reportState`, and
 *  - dispatches actions (`open_file`, and the gated `open_folder`/`clone_repo`/
 *    `switch_project`) to the renderer over {@link IDE_ACTION_CHANNEL}; the
 *    renderer runs them (with a confirmation for workspace-changing ones) and
 *    replies via `ide:resolveAction`.
 */

/** Main → renderer push: Claude asked the IDE to perform an action. */
export const IDE_ACTION_CHANNEL = "ide:action";

export const ideSelectionSchema = z.object({
  path: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  text: z.string(),
});
export type IdeSelection = z.infer<typeof ideSelectionSchema>;

/** The editor state the renderer mirrors to the main-process bridge. */
export const ideStateSchema = z.object({
  workspaceRoot: z.string().nullable(),
  activeFile: z.string().nullable(),
  openEditors: z.array(z.string()),
  selection: ideSelectionSchema.nullable(),
});
export type IdeState = z.infer<typeof ideStateSchema>;

/** An action Claude requested, pushed to the renderer. */
export const ideActionSchema = z.object({
  requestId: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()),
});
export type IdeAction = z.infer<typeof ideActionSchema>;

/** The renderer's reply once an action has run (or been declined). */
export const ideActionResultSchema = z.object({
  requestId: z.string(),
  ok: z.boolean(),
  message: z.string(),
});
export type IdeActionResult = z.infer<typeof ideActionResultSchema>;

export const ideConfigResultSchema = z.object({ path: z.string() }).nullable();
export const ideOkSchema = z.object({ ok: z.boolean() });
