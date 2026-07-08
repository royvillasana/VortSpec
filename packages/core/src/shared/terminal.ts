import { z } from "zod";

/**
 * Integrated-terminal contracts. A terminal session is a real PTY in the main
 * process (see `pty-manager.ts`) keyed by a renderer-supplied id; its output is
 * streamed back over `TERMINAL_DATA_CHANNEL`. Shared by both app shells so the
 * cockpit and the IDE mount the identical terminal.
 */

export const TERMINAL_DATA_CHANNEL = "terminal:data";

export const terminalDataSchema = z.object({
  id: z.string(),
  data: z.string(),
  /** set on the final event when the shell process exits */
  exit: z.number().nullable().optional(),
});
export type TerminalData = z.infer<typeof terminalDataSchema>;
