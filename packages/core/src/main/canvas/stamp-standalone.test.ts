import { describe, expect, it } from "vitest";
import { stampSource, vortspecSourceStamp } from "./stamp-standalone";
import { stampDataSource } from "./stamp-source";
import { parseDataSource } from "./stamp-source";

const SAMPLES = [
  `export function Card() {
  return (
    <div className="card">
      <h2 className="title">Hello</h2>
      <button variant="primary">Save</button>
    </div>
  );
}
`,
  `export const A = () => <img src="a.png" />;\n`,
  `export function List({ items }) {
  return <ul>{items.map((it) => <li className="row" key={it}>{it}</li>)}</ul>;
}
`,
];

describe("stampSource (raw-TS, bundled) parity with stampDataSource (ts-morph)", () => {
  it("produces byte-identical anchors for every sample", () => {
    for (const src of SAMPLES) {
      expect(stampSource(src, "src/X.tsx")).toBe(stampDataSource(src, "src/X.tsx"));
    }
  });

  it("anchors parse to file:line:column and are 1-based line / 0-based column", () => {
    const out = stampSource(SAMPLES[0], "src/Card.tsx");
    const btn = out.match(/<button[^>]*data-source="([^"]+)"/)?.[1];
    expect(parseDataSource(btn)).toEqual({ file: "src/Card.tsx", line: 5, column: 6 });
  });

  it("is idempotent", () => {
    const once = stampSource(SAMPLES[0], "src/Card.tsx");
    expect(stampSource(once, "src/Card.tsx")).toBe(once);
  });
});

describe("vortspecSourceStamp (standalone plugin)", () => {
  const p = vortspecSourceStamp({ root: "/proj" });
  it("is dev-only + pre and stamps a project .tsx", () => {
    expect(p.apply).toBe("serve");
    expect(p.enforce).toBe("pre");
    const res = p.transform!(`export const A = () => <div className="x">hi</div>;\n`, "/proj/src/A.tsx");
    expect(res!.code).toMatch(/data-source="src\/A\.tsx:1:23"/);
  });
  it("skips node_modules and non-JSX", () => {
    expect(p.transform!("<div/>", "/proj/node_modules/x/i.tsx")).toBeNull();
    expect(p.transform!("const n=1", "/proj/src/u.ts")).toBeNull();
  });
});
