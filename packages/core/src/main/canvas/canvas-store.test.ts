import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  CANVAS_DIR,
  loadGraph,
  saveGraph,
  loadScene,
  saveScene,
  writeSketchPng,
  writeVersionOutput,
} from "./canvas-store";
import { emptyGraph, addSketch, recordGeneration } from "../../shared/draw-graph";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vs-canvas-store-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// A real, decodable 1×1 transparent PNG as a data URL.
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

describe("graph round-trip", () => {
  it("save → load returns an equal graph", async () => {
    let g = emptyGraph();
    g = addSketch(g, { frameId: "frame-1", label: "product card" }, 1000);
    const rec = recordGeneration(g, { sketchId: "sketch:frame-1", component: "ProductCard", now: 2000 });
    g = rec.graph;

    await saveGraph(dir, g);
    const loaded = await loadGraph(dir);
    expect(loaded).toEqual(g);
  });

  it("load returns emptyGraph() when graph.json is absent", async () => {
    const loaded = await loadGraph(dir);
    expect(loaded).toEqual(emptyGraph());
  });

  it("load returns emptyGraph() when graph.json is malformed", async () => {
    const canvas = join(dir, CANVAS_DIR);
    await mkdir(canvas, { recursive: true });
    await writeFile(join(canvas, "graph.json"), "{ not valid json", "utf8");
    const loaded = await loadGraph(dir);
    expect(loaded).toEqual(emptyGraph());
  });
});

describe("scene round-trip", () => {
  it("save → load returns the same opaque string", async () => {
    const scene = '{"type":"excalidraw","elements":[],"appState":{}}';
    await saveScene(dir, scene);
    expect(await loadScene(dir)).toBe(scene);
  });

  it("load returns null when the scene is absent", async () => {
    expect(await loadScene(dir)).toBeNull();
  });
});

describe("writeSketchPng", () => {
  it("decodes a 1×1 PNG data URL and writes a file at the returned path", async () => {
    const path = await writeSketchPng(dir, "frame-1", PNG_1X1);
    expect(path.startsWith(join(dir, CANVAS_DIR) + sep)).toBe(true);
    const bytes = await readFile(path);
    // PNG magic number: 89 50 4E 47.
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(bytes.length).toBeGreaterThan(8);
  });

  it("rejects a non-PNG data URL", async () => {
    await expect(writeSketchPng(dir, "frame-1", "data:text/plain;base64,aGk=")).rejects.toThrow();
  });
});

describe("path containment", () => {
  it("sanitizes a traversal frameId so nothing escapes the canvas dir", async () => {
    const path = await writeSketchPng(dir, "../../evil", PNG_1X1);
    const canvas = join(dir, CANVAS_DIR);
    // The written file stays under .vortspec/canvas/exports.
    expect(path.startsWith(canvas + sep)).toBe(true);
    // No file leaked to the project root or its parent.
    const rootEntries = await readdir(dir);
    expect(rootEntries).not.toContain("evil.png");
    const exports = await readdir(join(canvas, "exports"));
    expect(exports.length).toBe(1);
    expect(exports[0].endsWith(".png")).toBe(true);
    expect(exports[0]).not.toContain("/");
    expect(exports[0]).not.toContain("..");
  });

  it("writeVersionOutput returns a contained path and writes the html", async () => {
    const path = await writeVersionOutput(dir, "version:ProductCard@2", "<div>hi</div>");
    expect(path.startsWith(join(dir, CANVAS_DIR) + sep)).toBe(true);
    expect(await readFile(path, "utf8")).toBe("<div>hi</div>");
  });
});
