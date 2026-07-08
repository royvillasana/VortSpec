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
