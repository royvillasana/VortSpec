import { describe, it, expect } from "vitest";
import {
  addSourcePrompt,
  chunkByLevel,
  tierForChunk,
  buildChunkPrompt,
  buildOnePrompt,
  RESCAN_PROMPT,
} from "./sdd-prompts";

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

describe("chunkByLevel — group builds atoms → molecules → organisms", () => {
  const comps = [
    { name: "Card", level: "organism" },
    { name: "Button", level: "atom" },
    { name: "Field", level: "molecule" },
    { name: "Input", level: "atom" },
    { name: "Modal", level: "organism" },
    { name: "Label", level: "atom" },
  ];

  it("orders by level then slices into chunks of size", () => {
    const chunks = chunkByLevel(comps, 2);
    // atoms first (Button, Input, Label — original order), then molecule, then organisms.
    expect(chunks.map((c) => c.map((x) => x.name))).toEqual([
      ["Button", "Input"],
      ["Label", "Field"],
      ["Card", "Modal"],
    ]);
  });

  it("defaults to chunks of five and preserves within-level order", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `A${i}`, level: "atom" }));
    const chunks = chunkByLevel(many);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toHaveLength(5);
    expect(chunks[1]).toHaveLength(2);
    expect(chunks[0][0].name).toBe("A0");
  });

  it("treats unknown/missing levels as last", () => {
    const chunks = chunkByLevel(
      [{ name: "Weird", level: null }, { name: "Btn", level: "atom" }],
      5,
    );
    expect(chunks[0].map((c) => c.name)).toEqual(["Btn", "Weird"]);
  });
});

describe("tierForChunk — route by complexity, never opus/fable", () => {
  it("routes atoms/molecules-only chunks to haiku", () => {
    expect(tierForChunk([{ name: "Button", level: "atom" }])).toBe("haiku");
    expect(
      tierForChunk([
        { name: "Button", level: "atom" },
        { name: "Field", level: "molecule" },
      ]),
    ).toBe("haiku");
  });

  it("routes a chunk containing an organism to sonnet", () => {
    expect(
      tierForChunk([
        { name: "Button", level: "atom" },
        { name: "Modal", level: "organism" },
      ]),
    ).toBe("sonnet");
  });
});

describe("buildChunkPrompt — scoped to the named components", () => {
  it("names only the chunk's components and forbids building others", () => {
    const p = buildChunkPrompt(["Button", "Input"]);
    expect(p).toContain('"Button", "Input"');
    expect(p).toMatch(/Do NOT build any other component in this run/);
    expect(p).toMatch(/Skip any that already have a source file/);
  });

  it("appends verify, storybook, and manifest steps only when requested", () => {
    const bare = buildChunkPrompt(["Button"]);
    expect(bare).not.toMatch(/\/visual-verify/);
    expect(bare).not.toMatch(/\/storybook/);
    expect(bare).not.toMatch(/\/design-doc/);

    const full = buildChunkPrompt(["Card"], {
      verify: true,
      storybook: true,
      manifest: true,
      url: "http://localhost:6006",
      isFigma: true,
    });
    expect(full).toMatch(/\/visual-verify/);
    expect(full).toMatch(/\/storybook/);
    expect(full).toMatch(/\/design-doc/);
    expect(full).toContain("http://localhost:6006");
    expect(full).toMatch(/Figma MCP/);
  });
});

describe("detection — collapse variant sets + drop internal nodes", () => {
  it("RESCAN_PROMPT collapses COMPONENT_SETs and slash-named variant families", () => {
    expect(RESCAN_PROMPT).toMatch(/COLLAPSE VARIANTS/);
    expect(RESCAN_PROMPT).toMatch(/COMPONENT_SET is ONE component/);
    expect(RESCAN_PROMPT).toMatch(/form-item\/horizontal\/input/);
    expect(RESCAN_PROMPT).toMatch(/NOT one entry per combination/);
    // Records the variant axes rather than exploding.
    expect(RESCAN_PROMPT).toMatch(/variants/);
  });

  it("RESCAN_PROMPT excludes internal sub-components + styles by composition, not the components/ folder", () => {
    expect(RESCAN_PROMPT).toMatch(/EXCLUDE internal sub-components and styles/);
    expect(RESCAN_PROMPT).toMatch(/underscore-prefixed/);
    expect(RESCAN_PROMPT).toMatch(/dot-prefixed .* STYLES/);
    expect(RESCAN_PROMPT).toMatch(/used ONLY as a child inside ONE other component/);
    // The `components/` folder must NOT be treated as an internal marker.
    expect(RESCAN_PROMPT).toMatch(/`components\/` folder prefix is NOT by itself an internal marker/);
    // And repairs a prior wrongly-split inventory.
    expect(RESCAN_PROMPT).toMatch(/wrongly split a set into per-variant rows/);
  });

  it("build prompts implement a collapsed variant set as ONE component", () => {
    expect(buildOnePrompt("form-item")).toMatch(/single .* component .* ALL those variants|SINGLE component that covers ALL those variants/i);
    expect(buildChunkPrompt(["form-item"])).toMatch(/SINGLE component that covers ALL those variants/);
  });

  it("RESCAN_PROMPT prefers the remote OAuth Figma MCP (no Desktop Bridge, no token) and never fabricates", () => {
    expect(RESCAN_PROMPT).toMatch(/PREFER the remote\/official Figma MCP/);
    expect(RESCAN_PROMPT).toMatch(/mcp\.figma\.com/);
    expect(RESCAN_PROMPT).toMatch(/NO local Desktop Bridge/);
    expect(RESCAN_PROMPT).toMatch(/VARIABLES \+ STYLES/);
    expect(RESCAN_PROMPT).toMatch(/never fabricate a value/);
  });
});
