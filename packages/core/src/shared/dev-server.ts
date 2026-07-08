import { z } from "zod";

/**
 * Managed dev-server contracts. VortSpec launches the project's own dev/storybook
 * script (in the project folder, arg-array spawn — no shell interpolation),
 * parses the local URL from its output, and the renderer embeds it for live
 * component preview. The process is confined to the project folder.
 */

export const devServerStateSchema = z.enum([
  "stopped",
  "starting",
  "running",
  "error",
  "no-script",
]);
export type DevServerState = z.infer<typeof devServerStateSchema>;

export const devServerStatusSchema = z.object({
  state: devServerStateSchema,
  /** The detected local URL once the server is up. */
  url: z.string().nullable(),
  /** The package.json script being run (e.g. "dev", "storybook"). */
  script: z.string().nullable(),
  /** A human message for error / no-script states. */
  message: z.string().nullable(),
});
export type DevServerStatus = z.infer<typeof devServerStatusSchema>;

/**
 * Which managed surface: `storybook` (the component Playground) or `app` (the
 * project's own application dev server — the live localhost runtime, M5). Both can
 * run at once; they're keyed separately.
 */
export const serverKindSchema = z.enum(["storybook", "app"]);
export type ServerKind = z.infer<typeof serverKindSchema>;

/** main → renderer push channel for live status updates. */
export const DEV_SERVER_UPDATE_CHANNEL = "devserver:update";

export const devServerUpdateSchema = z.object({
  projectPath: z.string(),
  kind: serverKindSchema.default("storybook"),
  status: devServerStatusSchema,
});
export type DevServerUpdate = z.infer<typeof devServerUpdateSchema>;
