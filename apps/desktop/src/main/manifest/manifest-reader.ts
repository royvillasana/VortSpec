import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import type {
  ManifestResult,
  ManifestFormat,
  ManifestVersion,
  ManifestVersionsResult,
  SnapshotReason,
} from "@vortspec/core/manifest";

/**
 * Design manifest (DESIGN.md) data layer — all file-derived, no IR store.
 * VortSpec reads/versions/gates the manifest the `design-doc` skill produces; it
 * never authors the content. Every write is snapshot-first so it can be reverted.
 */

// The design-doc skill writes DESIGN.md at the project root; the Claude Design
// mockup labels it .sdd-de/design.md. Resolve in this order and remember which.
const CANDIDATES = ["DESIGN.md", ".sdd-de/design.md", "design.md"];
const DEFAULT_TARGET = "DESIGN.md";
const VERSIONS_DIR = ".vortspec/manifests";
const INDEX_FILE = ".vortspec/manifests/index.json";

/**
 * Detect whether the manifest is the `@google/design.md` format. The Google
 * linter keys "not the format" on the absence of YAML — so we mirror that: a
 * leading `---` frontmatter block containing any design-token key is the Google
 * format; anything else with content is a token-decisions log. Cheap + offline;
 * the authoritative `npx @google/design.md lint` runs inside the generate prompt.
 */
export function detectManifestFormat(content: string): ManifestFormat {
  if (!content.trim()) return "empty";
  const fm = /^﻿?\s*---\s*\n([\s\S]*?)\n---/.exec(content);
  if (fm && /^\s*(colors|typography|components|rounded|spacing|name)\s*:/m.test(fm[1])) {
    return "google";
  }
  return "decisions-log";
}

/** Resolve the manifest path (first existing candidate) + its content. */
export async function getManifest(projectPath: string): Promise<ManifestResult> {
  for (const rel of CANDIDATES) {
    const content = await readFile(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) return { path: rel, content, exists: true, format: detectManifestFormat(content) };
  }
  return { path: DEFAULT_TARGET, content: "", exists: false, format: "empty" };
}

/** Where a write should land: the existing manifest, else the default target. */
async function resolveTarget(projectPath: string): Promise<string> {
  for (const rel of CANDIDATES) {
    const ok = await readFile(join(projectPath, rel), "utf8").then(
      () => true,
      () => false,
    );
    if (ok) return rel;
  }
  return DEFAULT_TARGET;
}

interface VersionMeta {
  id: string;
  timestamp: string;
  approved: boolean;
  runId?: string;
  size: number;
  reason: SnapshotReason;
}

async function readIndex(projectPath: string): Promise<VersionMeta[]> {
  const raw = await readFile(join(projectPath, INDEX_FILE), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VersionMeta[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(projectPath: string, metas: VersionMeta[]): Promise<void> {
  const path = join(projectPath, INDEX_FILE);
  await mkdir(join(projectPath, VERSIONS_DIR), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(metas, null, 2)}\n`, "utf8").catch(() => undefined);
}

/**
 * Snapshot the current manifest under `.vortspec/manifests/`. A no-op (returns
 * null) when there is nothing to snapshot. `timestamp` is passed in — the main
 * process stamps it (renderer/IPC can't reach a clock deterministically in tests).
 */
export async function snapshotManifest(
  projectPath: string,
  opts: { reason: SnapshotReason; runId?: string; timestamp: string },
): Promise<ManifestVersion | null> {
  const current = await getManifest(projectPath);
  if (!current.exists || !current.content) return null;
  const id = opts.timestamp.replace(/[:.]/g, "-");
  await mkdir(join(projectPath, VERSIONS_DIR), { recursive: true }).catch(() => undefined);
  await writeFile(join(projectPath, VERSIONS_DIR, `${id}.md`), current.content, "utf8").catch(
    () => undefined,
  );
  const meta: VersionMeta = {
    id,
    timestamp: opts.timestamp,
    approved: opts.reason === "approve",
    runId: opts.runId,
    size: current.content.length,
    reason: opts.reason,
  };
  const index = await readIndex(projectPath);
  index.unshift(meta);
  await writeIndex(projectPath, index);
  return { id, timestamp: meta.timestamp, approved: meta.approved, runId: meta.runId, size: meta.size };
}

/** Save edited manifest content (snapshot the prior content first). */
export async function saveManifest(
  projectPath: string,
  content: string,
  timestamp: string,
): Promise<ManifestResult> {
  await snapshotManifest(projectPath, { reason: "edit", timestamp });
  const target = await resolveTarget(projectPath);
  const abs = join(projectPath, target);
  await mkdir(dirname(abs), { recursive: true }).catch(() => undefined);
  await writeFile(abs, content, "utf8");
  return { path: target, content, exists: true };
}

/** List snapshots, newest first, filtered to those whose file still exists. */
export async function listManifestVersions(
  projectPath: string,
): Promise<ManifestVersionsResult> {
  const index = await readIndex(projectPath);
  const dir = join(projectPath, VERSIONS_DIR);
  const present = new Set(await readdir(dir).catch(() => [] as string[]));
  const versions: ManifestVersion[] = index
    .filter((m) => present.has(`${m.id}.md`))
    .map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      approved: m.approved,
      runId: m.runId,
      size: m.size,
    }));
  return { versions };
}

/** Read one snapshot's content. */
export async function readManifestVersion(
  projectPath: string,
  id: string,
): Promise<string | null> {
  return readFile(join(projectPath, VERSIONS_DIR, `${id}.md`), "utf8").catch(() => null);
}

/** Restore a snapshot back to the manifest path (snapshot current first). */
export async function restoreManifestVersion(
  projectPath: string,
  id: string,
  timestamp: string,
): Promise<ManifestResult> {
  const content = await readManifestVersion(projectPath, id);
  if (content === null) return getManifest(projectPath);
  await snapshotManifest(projectPath, { reason: "restore", timestamp });
  const target = await resolveTarget(projectPath);
  await writeFile(join(projectPath, target), content, "utf8");
  return { path: target, content, exists: true };
}
