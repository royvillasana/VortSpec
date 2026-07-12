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

/** A node currently selected in Figma Desktop (Wave 3 convenience). */
export const figmaNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Figma node type, e.g. COMPONENT / COMPONENT_SET / FRAME / INSTANCE. */
  type: z.string(),
});
export type FigmaNode = z.infer<typeof figmaNodeSchema>;

/** The current Figma selection, read through figma-cli. */
export const figmaSelectionSchema = z.object({
  nodes: z.array(figmaNodeSchema),
  /** a human, next-step message (e.g. "select a node in Figma first"). */
  message: z.string(),
});
export type FigmaSelection = z.infer<typeof figmaSelectionSchema>;

/**
 * The classified health of the Figma read path used to extract tokens/styles.
 * A shallow "MCP connected" handshake is not enough — the token can be expired
 * (REST 403) or the Desktop Bridge can be closed, and the extraction then
 * silently degrades to guessing. This distinguishes those failure modes so the
 * app can tell the user exactly what to fix before they re-run the scan.
 */
export const figmaHealthModeSchema = z.enum([
  "ok", // variables + styles are readable
  "token-expired", // Figma REST API returned 401/403 — the token needs refreshing
  "bridge-down", // the Figma Desktop Bridge plugin isn't running/reachable
  "no-variables", // the connection works but returned no variables/styles
  "not-configured", // no Figma MCP is connected to Claude Code
  "unknown", // the diagnostic couldn't determine the state
]);
export type FigmaHealthMode = z.infer<typeof figmaHealthModeSchema>;

export const figmaHealthSchema = z.object({
  mode: figmaHealthModeSchema,
  /** the Figma REST/API token authenticates (no 401/403). */
  tokenValid: z.boolean(),
  /** the Figma Desktop Bridge plugin is running and reachable. */
  bridgeConnected: z.boolean(),
  /** variables AND styles could actually be read. */
  canRead: z.boolean(),
  /** how many variables the probe read (0 when it couldn't). */
  variableCount: z.number(),
  /** how many styles the probe read. */
  styleCount: z.number(),
  /** a human, next-step message for the UI. */
  message: z.string(),
  /** the raw one-line detail from the probe. */
  detail: z.string(),
});
export type FigmaHealth = z.infer<typeof figmaHealthSchema>;

export const figmaHealthRequestSchema = z.object({
  projectPath: z.string(),
  /** overrides the project.yaml `figma_file_url` when provided. */
  figmaFileUrl: z.string().optional(),
});

/**
 * Where the Figma personal-access token lives (the user's own figma-console MCP
 * config). Reports only presence — never the token value — because VortSpec
 * stores no provider keys; it write-throughs a new token into the user's config.
 */
export const figmaTokenStatusSchema = z.object({
  /** a non-empty token is currently set on the Figma MCP. */
  configured: z.boolean(),
  /** the MCP server name it's set on (e.g. "figma-console"), or null if none. */
  serverName: z.string().nullable(),
  /** the env var the token is stored under (e.g. "FIGMA_ACCESS_TOKEN"), or null. */
  envVar: z.string().nullable(),
  /** a human, next-step message. */
  message: z.string(),
});
export type FigmaTokenStatus = z.infer<typeof figmaTokenStatusSchema>;

export const figmaSetTokenRequestSchema = z.object({ token: z.string() });
