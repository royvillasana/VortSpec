import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getManifest,
  saveManifest,
  snapshotManifest,
  listManifestVersions,
  readManifestVersion,
  restoreManifestVersion,
  detectManifestFormat,
} from "./manifest-reader";

const GOOGLE = `---
name: Heritage
colors:
  primary: "#1A1C1E"
---

## Overview
A design system.`;

const DECISIONS_LOG = `# Design Decisions & Token Mapping

Running log maintained by /sync-tokens.

## Token mapping
| alias | value |
|---|---|`;

describe("detectManifestFormat", () => {
  it("recognizes the @google/design.md format by its token frontmatter", () => {
    expect(detectManifestFormat(GOOGLE)).toBe("google");
  });
  it("flags a token-decisions log (no YAML frontmatter) as decisions-log", () => {
    expect(detectManifestFormat(DECISIONS_LOG)).toBe("decisions-log");
  });
  it("treats blank content as empty", () => {
    expect(detectManifestFormat("")).toBe("empty");
    expect(detectManifestFormat("   \n  ")).toBe("empty");
  });
  it("does not count a frontmatter without design-token keys as google", () => {
    expect(detectManifestFormat("---\ntitle: notes\n---\n\n# x")).toBe("decisions-log");
  });
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-manifest-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("getManifest — path resolution", () => {
  it("resolves root DESIGN.md first", async () => {
    await writeFile(join(dir, "DESIGN.md"), "# Root manifest\n", "utf8");
    const r = await getManifest(dir);
    expect(r).toEqual({ path: "DESIGN.md", content: "# Root manifest\n", exists: true, format: "decisions-log" });
  });

  it("falls back to .sdd-de/design.md", async () => {
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de/design.md"), "# Nested\n", "utf8");
    const r = await getManifest(dir);
    expect(r.path).toBe(".sdd-de/design.md");
    expect(r.exists).toBe(true);
  });

  it("reports the default target when no manifest exists", async () => {
    const r = await getManifest(dir);
    expect(r).toEqual({ path: "DESIGN.md", content: "", exists: false, format: "empty" });
  });
});

describe("saveManifest — gated write (snapshot-first)", () => {
  it("writes new content and snapshots the prior version", async () => {
    await writeFile(join(dir, "DESIGN.md"), "v1\n", "utf8");
    const r = await saveManifest(dir, "v2\n", "2026-07-06T10:00:00.000Z");
    expect(r.content).toBe("v2\n");
    expect(await readFile(join(dir, "DESIGN.md"), "utf8")).toBe("v2\n");
    // The prior content is captured as a version.
    const { versions } = await listManifestVersions(dir);
    expect(versions).toHaveLength(1);
    const prior = await readManifestVersion(dir, versions[0].id);
    expect(prior).toBe("v1\n");
  });

  it("creates the parent dir for a nested target", async () => {
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de/design.md"), "old\n", "utf8");
    await saveManifest(dir, "new\n", "2026-07-06T10:05:00.000Z");
    expect(await readFile(join(dir, ".sdd-de/design.md"), "utf8")).toBe("new\n");
  });
});

describe("snapshot / list / restore", () => {
  it("no-ops when there is nothing to snapshot", async () => {
    const snap = await snapshotManifest(dir, {
      reason: "generate",
      timestamp: "2026-07-06T10:00:00.000Z",
    });
    expect(snap).toBeNull();
    expect((await listManifestVersions(dir)).versions).toEqual([]);
  });

  it("marks approve snapshots as approved and lists newest first", async () => {
    await writeFile(join(dir, "DESIGN.md"), "a\n", "utf8");
    await snapshotManifest(dir, { reason: "generate", timestamp: "2026-07-06T10:00:00.000Z" });
    await writeFile(join(dir, "DESIGN.md"), "b\n", "utf8");
    await snapshotManifest(dir, { reason: "approve", timestamp: "2026-07-06T10:01:00.000Z" });
    const { versions } = await listManifestVersions(dir);
    expect(versions).toHaveLength(2);
    // Newest (approve) first.
    expect(versions[0].approved).toBe(true);
    expect(versions[1].approved).toBe(false);
  });

  it("restores a prior version and snapshots the current one first", async () => {
    await writeFile(join(dir, "DESIGN.md"), "original\n", "utf8");
    await snapshotManifest(dir, { reason: "generate", timestamp: "2026-07-06T10:00:00.000Z" });
    const { versions } = await listManifestVersions(dir);
    const originalId = versions[0].id;

    await writeFile(join(dir, "DESIGN.md"), "edited\n", "utf8");
    const r = await restoreManifestVersion(dir, originalId, "2026-07-06T10:02:00.000Z");

    expect(r.content).toBe("original\n");
    expect(await readFile(join(dir, "DESIGN.md"), "utf8")).toBe("original\n");
    // Restoring snapshotted the "edited" content, so there are now 2 versions.
    expect((await listManifestVersions(dir)).versions.length).toBe(2);
  });
});
