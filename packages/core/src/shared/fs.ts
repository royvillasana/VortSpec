import { z } from "zod";

/**
 * Workspace filesystem contracts. Every file operation is scoped to the
 * selected workspace root in the main process (see `fs-workspace.ts`); the
 * renderer never touches `fs` directly. Paths are workspace-relative, POSIX
 * separators.
 */

export const fsEntrySchema = z.object({
  name: z.string(),
  /** path relative to the workspace root, using "/" separators */
  path: z.string(),
  type: z.enum(["file", "dir"]),
});
export type FsEntry = z.infer<typeof fsEntrySchema>;

export const fsFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  /** true when the file was binary or too large to read as text */
  truncated: z.boolean(),
});
export type FsFile = z.infer<typeof fsFileSchema>;

export const fsWriteResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type FsWriteResult = z.infer<typeof fsWriteResultSchema>;

/** Streamed when a watched workspace changes on disk (e.g. an agent run wrote
 *  a file). `path` is null for a broad "re-read everything" signal. */
export const WORKSPACE_CHANGE_CHANNEL = "workspace:change";
export const workspaceChangeSchema = z.object({
  projectPath: z.string(),
  path: z.string().nullable(),
  kind: z.enum(["add", "change", "unlink", "refresh"]),
});
export type WorkspaceChange = z.infer<typeof workspaceChangeSchema>;
