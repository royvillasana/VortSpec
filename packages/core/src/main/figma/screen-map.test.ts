import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readScreenMap,
  writeScreenMap,
  upsertScreen,
  designSystemFileKey,
  resolveTargetFileKey,
} from "./screen-map";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vs-screenmap-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("screen-map", () => {
  it("returns an empty map when none exists", async () => {
    expect(await readScreenMap(dir)).toEqual({ screens: {} });
  });

  it("upserts a screen and persists it (round-trips through disk)", async () => {
    await upsertScreen(dir, "/home", { file: "src/Home.tsx", figmaNodeId: "1:2" }, "FILEKEY");
    const map = await readScreenMap(dir);
    expect(map.figmaFileKey).toBe("FILEKEY");
    expect(map.screens["/home"]).toMatchObject({ file: "src/Home.tsx", figmaNodeId: "1:2" });
    // Re-send updates the same key in place, not a duplicate.
    await upsertScreen(dir, "/home", { file: "src/Home.tsx", figmaNodeId: "9:9" });
    const map2 = await readScreenMap(dir);
    expect(Object.keys(map2.screens)).toEqual(["/home"]);
    expect(map2.screens["/home"].figmaNodeId).toBe("9:9");
    expect(map2.figmaFileKey).toBe("FILEKEY"); // unchanged when omitted
  });

  it("reads the design-system file key from components.json", async () => {
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de/components.json"), JSON.stringify({ fileKey: "DSKEY", components: [] }), "utf8");
    expect(await designSystemFileKey(dir)).toBe("DSKEY");
  });

  it("falls back to the figma_file_url in project.yaml", async () => {
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(
      join(dir, ".sdd-de/project.yaml"),
      'framework: react\nfigma_file_url: "https://www.figma.com/design/URLKEY/My-File?node-id=1-2"\n',
      "utf8",
    );
    expect(await designSystemFileKey(dir)).toBe("URLKEY");
  });

  it("resolveTargetFileKey prefers a recorded key over the DS file", async () => {
    await mkdir(join(dir, ".sdd-de"), { recursive: true });
    await writeFile(join(dir, ".sdd-de/components.json"), JSON.stringify({ fileKey: "DSKEY" }), "utf8");
    expect(await resolveTargetFileKey(dir)).toBe("DSKEY"); // no map yet → DS file
    await writeScreenMap(dir, { figmaFileKey: "RECORDED", screens: {} });
    expect(await resolveTargetFileKey(dir)).toBe("RECORDED"); // recorded wins
  });

  it("resolveTargetFileKey is null when nothing is recorded", async () => {
    expect(await resolveTargetFileKey(dir)).toBeNull();
  });

  it("writeScreenMap creates .vortspec/maps and pretty-prints", async () => {
    await writeScreenMap(dir, { figmaFileKey: "K", screens: {} });
    const raw = await readFile(join(dir, ".vortspec/maps/screens.json"), "utf8");
    expect(raw).toContain('"figmaFileKey": "K"');
    expect(raw.endsWith("\n")).toBe(true);
  });
});
