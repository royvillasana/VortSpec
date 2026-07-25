import { describe, expect, it } from "vitest";
import { stampDataSource, parseDataSource } from "./stamp-source";
import { checkResolvability, setJsxAttr, type Anchor } from "./codemod";

const CARD = `export function Card() {
  return (
    <div className="card">
      <button className="cta">Go</button>
    </div>
  );
}
`;

describe("stampDataSource", () => {
  it("stamps every element with a project-relative file:line:column", () => {
    const out = stampDataSource(CARD, "src/Card.tsx");
    expect(out).toMatch(/<div className="card" data-source="src\/Card\.tsx:3:4"/);
    expect(out).toMatch(/<button className="cta" data-source="src\/Card\.tsx:4:6">Go<\/button>/);
  });

  it("is idempotent — re-stamping doesn't add a second attribute", () => {
    const once = stampDataSource(CARD, "src/Card.tsx");
    const twice = stampDataSource(once, "src/Card.tsx");
    expect(twice).toBe(once);
    expect(once.match(/data-source=/g)?.length).toBe(2);
  });

  it("handles self-closing elements", () => {
    const src = `export const A = () => <img src="a.png" />;\n`;
    const out = stampDataSource(src, "src/A.tsx");
    expect(out).toMatch(/<img src="a\.png" data-source="src\/A\.tsx:1:23" \/>/);
  });

  it("returns input unchanged when there is no JSX", () => {
    const src = `export const n = 1;\n`;
    expect(stampDataSource(src, "x.ts")).toBe(src);
  });
});

describe("parseDataSource", () => {
  it("round-trips a stamped value into a file + anchor", () => {
    expect(parseDataSource("src/Card.tsx:4:6")).toEqual({ file: "src/Card.tsx", line: 4, column: 6 });
  });
  it("returns null for empty/garbage", () => {
    expect(parseDataSource(null)).toBeNull();
    expect(parseDataSource("nope")).toBeNull();
  });
});

describe("the stamp round-trips to the codemods (the whole point)", () => {
  it("a stamped anchor locates the exact element for a resolvable edit", () => {
    // The bridge would read data-source off the DOM; parse it; the codemod uses that anchor
    // against the ORIGINAL (un-stamped) source.
    const stamped = stampDataSource(CARD, "src/Card.tsx");
    const value = stamped.match(/<button[^>]*data-source="([^"]+)"/)?.[1];
    const parsed = parseDataSource(value);
    expect(parsed).toBeTruthy();
    const anchor: Anchor = { line: parsed!.line, column: parsed!.column };

    // Codemods run against the real (un-stamped) file the user edits.
    expect(checkResolvability(CARD, anchor).resolvable).toBe(true);
    const edited = setJsxAttr(CARD, anchor, "className", { kind: "string", value: "cta cta--lg" });
    expect(edited).toContain('className="cta cta--lg"');
  });
});
