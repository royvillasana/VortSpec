import { z } from "zod";

/**
 * Design manifest (DESIGN.md) contracts. The manifest is a plain file the
 * `design-doc` skill (`@google/design.md`) writes into the project; VortSpec
 * reads, versions, and gates it — it never authors the content. Zod validation
 * lives only at this parse boundary.
 */

export const manifestResultSchema = z.object({
  /** Project-relative path of the resolved manifest, or the default target when absent. */
  path: z.string(),
  /** Manifest markdown, or "" when it does not exist yet. */
  content: z.string(),
  exists: z.boolean(),
});
export type ManifestResult = z.infer<typeof manifestResultSchema>;

/** One snapshot of DESIGN.md under `.vortspec/manifests/`. */
export const manifestVersionSchema = z.object({
  /** Snapshot id — the ISO-ish timestamp used as the file stem. */
  id: z.string(),
  /** ISO timestamp the snapshot was taken. */
  timestamp: z.string(),
  /** Whether this snapshot was captured at an approval. */
  approved: z.boolean(),
  /** The run id that produced it, if it came from a generate/regenerate. */
  runId: z.string().optional(),
  /** Byte length of the snapshot content, for the version list. */
  size: z.number(),
});
export type ManifestVersion = z.infer<typeof manifestVersionSchema>;

export const manifestVersionsResultSchema = z.object({
  versions: z.array(manifestVersionSchema),
});
export type ManifestVersionsResult = z.infer<typeof manifestVersionsResultSchema>;

/** Why a snapshot is being taken — recorded in the version index. */
export const snapshotReasonSchema = z.enum(["generate", "edit", "approve", "restore"]);
export type SnapshotReason = z.infer<typeof snapshotReasonSchema>;
