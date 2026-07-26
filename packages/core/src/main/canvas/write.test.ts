import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCanvasEdit, isEditableProjectFile } from "./write";
import type { Anchor } from "@vortspec/core/canvas-edit";

function anchorAt(text: string, needle: string): Anchor {
  const idx = text.indexOf(needle);
  const before = text.slice(0, idx);
  return { line: before.split("\n").length, column: idx - (before.lastIndexOf("\n") + 1) };
}

let dir: string;
const FILE = "src/components/Card.tsx";
const STATIC = `export function Card() {
  return (
    <div className="card">
      <button className="cta">Go</button>
    </div>
  );
}
`;
const DYNAMIC = `export function List({ items }) {
  return <ul>{items.map((it) => <li className="row">{it}</li>)}</ul>;
}
`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vs-canvas-"));
  await mkdir(join(dir, "src/components"), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("isEditableProjectFile — RT-1 path-containment gate", () => {
  const proj = "/tmp/proj";
  it("accepts source files inside the project", () => {
    expect(isEditableProjectFile(proj, "src/App.tsx")).toBe(true);
    expect(isEditableProjectFile(proj, "src/components/Card.jsx")).toBe(true);
  });
  it("rejects path traversal out of the project", () => {
    expect(isEditableProjectFile(proj, "../../../etc/passwd.tsx")).toBe(false);
    expect(isEditableProjectFile(proj, "../sibling/App.tsx")).toBe(false);
    expect(isEditableProjectFile(proj, "/etc/hosts")).toBe(false);
  });
  it("rejects non-source files (even inside the project)", () => {
    expect(isEditableProjectFile(proj, "index.html")).toBe(false);
    expect(isEditableProjectFile(proj, "src/styles.css")).toBe(false);
    expect(isEditableProjectFile(proj, "")).toBe(false);
  });
});

describe("applyCanvasEdit refuses an out-of-project / non-source target BEFORE any I/O", () => {
  it("returns ok:false for a traversal path and never touches disk", async () => {
    const res = await applyCanvasEdit(dir, "../../../etc/passwd.tsx", { op: "delete", anchor: { line: 1, column: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/outside the project|not a source file/);
  });
  it("returns ok:false for index.html (not a JSX source file)", async () => {
    const res = await applyCanvasEdit(dir, "index.html", { op: "delete", anchor: { line: 9, column: 4 } });
    expect(res.ok).toBe(false);
  });
});

describe("applyCanvasEdit", () => {
  it("writes a resolvable attr edit to source and returns a pre-edit snapshot", async () => {
    await writeFile(join(dir, FILE), STATIC, "utf8");
    const res = await applyCanvasEdit(dir, FILE, {
      op: "attr",
      anchor: anchorAt(STATIC, "<button"),
      name: "className",
      value: { kind: "string", value: "cta cta--lg" },
    });
    expect(res.ok).toBe(true);
    expect(res.snapshot?.[0]).toEqual({ path: FILE, content: STATIC }); // undo capture = pre-edit
    expect(await readFile(join(dir, FILE), "utf8")).toContain('className="cta cta--lg"');
  });

  it("WITHHOLDS the write for an un-resolvable anchor and leaves source untouched", async () => {
    await writeFile(join(dir, FILE), DYNAMIC, "utf8");
    const res = await applyCanvasEdit(dir, FILE, {
      op: "attr",
      anchor: anchorAt(DYNAMIC, "<li"),
      name: "className",
      value: { kind: "string", value: "row row--hot" },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/list|map/i);
    // Source is byte-identical — nothing was written.
    expect(await readFile(join(dir, FILE), "utf8")).toBe(DYNAMIC);
  });

  it("reports a fixable reason when the file can't be read (no crash)", async () => {
    const res = await applyCanvasEdit(dir, "does/not/exist.tsx", {
      op: "delete",
      anchor: { line: 1, column: 0 },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });
});
