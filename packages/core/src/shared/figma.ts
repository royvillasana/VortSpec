import { z } from "zod";

/**
 * Figma connection via the local figma-cli (github.com/silships/figma-cli),
 * which drives Figma Desktop directly — no API token. It is VortSpec's PRIMARY
 * Figma connection; the MCP bridge + REST token remain as fallbacks when the
 * CLI isn't connected.
 *
 * Two CLI modes:
 * - "yolo": direct Chrome-DevTools patch of Figma Desktop (~10× faster). Needs
 *   the running app granted macOS App Management (Privacy & Security).
 * - "safe": a Figma plugin bridge — no OS permission, one-time plugin import.
 */
export const figmaCliModeSchema = z.enum(["yolo", "safe"]);
export type FigmaCliMode = z.infer<typeof figmaCliModeSchema>;

export const figmaConnectionSchema = z.object({
  /** figma-cli is present on disk (cloned + installed). */
  installed: z.boolean(),
  /** where the CLI lives. */
  cliDir: z.string(),
  /** the background daemon is running. */
  daemonRunning: z.boolean(),
  /** a live connection to Figma Desktop is established (a real command works). */
  connected: z.boolean(),
  /** the active connection mode, if connected. */
  mode: figmaCliModeSchema.nullable(),
  /** names of the user's open Figma files (proof of connection). */
  openFiles: z.array(z.string()),
  /** the app macOS must grant App Management for yolo mode (this app's name). */
  appName: z.string(),
  /** a human, next-step message. */
  message: z.string(),
});
export type FigmaConnection = z.infer<typeof figmaConnectionSchema>;

export const figmaConnectRequestSchema = z.object({ mode: figmaCliModeSchema });

/**
 * Result of reading design variables from Figma into the local reconcile cache
 * (`.vortspec/figma-variables.json`) — step 1's PRIMARY reader. `source` is
 * `"cli"` when figma-cli produced the export, or null when the CLI couldn't
 * (not installed/connected) and the caller should fall back to the MCP path.
 */
export const figmaSyncRequestSchema = z.object({ projectPath: z.string() });

export const figmaSyncResultSchema = z.object({
  /** the export succeeded and the cache was written. */
  ok: z.boolean(),
  /** how many variables were written. */
  count: z.number(),
  /** what produced the export, or null when the CLI was unavailable. */
  source: z.enum(["cli"]).nullable(),
  /** the CLI mode the export ran under, if known. */
  mode: figmaCliModeSchema.nullable(),
  /** a human, next-step message (e.g. why the CLI couldn't be used). */
  message: z.string(),
});
export type FigmaSyncResult = z.infer<typeof figmaSyncResultSchema>;

/**
 * A component read from the connected Figma file (Wave 3). Scoped to the design
 * system's real components — every COMPONENT_SET plus top-level COMPONENTs —
 * not the thousands of nested/icon instances.
 */
export const figmaComponentSchema = z.object({
  name: z.string(),
  /** true for a COMPONENT_SET (has variant axes); false for a plain COMPONENT. */
  isSet: z.boolean(),
  /** variant axis names (e.g. ["Type", "Size"]); empty for a plain component. */
  variants: z.array(z.string()).default([]),
});
export type FigmaComponent = z.infer<typeof figmaComponentSchema>;
