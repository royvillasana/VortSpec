import { describe, it, expect } from "vitest";
import { addSourcePrompt } from "./sdd-prompts";

describe("addSourcePrompt — re-run the Foundation against a new source", () => {
  const figma = { kind: "figma" as const, ref: "https://figma.com/file/abc" };
  const local = { kind: "local" as const, ref: "/tmp/components" };

  it("clean-sweep REPLACES the token set + rewrites the inventory", () => {
    const p = addSourcePrompt("clean-sweep", figma);
    expect(p).toMatch(/REPLACING the current one/);
    expect(p).toMatch(/replacing the existing token set/);
    expect(p).toMatch(/REWRITE `\.sdd-de\/components\.json`/);
    expect(p).toContain("https://figma.com/file/abc");
    // Clean-sweep is a replace — it must NOT instruct a merge.
    expect(p).not.toMatch(/MERGE/);
  });

  it("merge is additive and FLAGS same-name conflicts (never overwrites)", () => {
    const p = addSourcePrompt("merge", figma);
    expect(p).toMatch(/MERGE .* additive, never destructive/);
    expect(p).toMatch(/DO NOT overwrite — FLAG it as a conflict/);
    expect(p).toMatch(/deduped by name/);
    expect(p).toMatch(/FLAG the conflict/);
    expect(p).toMatch(/do NOT delete entries/);
  });

  it("names the source: Figma URL vs local path", () => {
    expect(addSourcePrompt("merge", figma)).toMatch(/Figma file at https:\/\/figma\.com\/file\/abc/);
    expect(addSourcePrompt("merge", local)).toMatch(/local design source at `\/tmp\/components`/);
  });
});
