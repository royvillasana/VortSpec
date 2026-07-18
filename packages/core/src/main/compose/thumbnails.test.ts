import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readComponentThumbnail, writeComponentThumbnail } from "./thumbnails";

// A 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("component thumbnail cache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-thumbs-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when nothing is cached", async () => {
    expect(await readComponentThumbnail(dir, "Card")).toBeNull();
  });

  it("round-trips a stored thumbnail as a data URL", async () => {
    await writeComponentThumbnail(dir, "Card", PNG_BASE64);
    const url = await readComponentThumbnail(dir, "Card");
    expect(url).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it("sanitizes the component name into a safe filename", async () => {
    // A name with slashes/spaces must not escape the thumbs dir or break the read.
    await writeComponentThumbnail(dir, "ui/Card Group", PNG_BASE64);
    expect(await readComponentThumbnail(dir, "ui/Card Group")).toContain("data:image/png;base64,");
  });
});
