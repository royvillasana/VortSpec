import { describe, it, expect } from "vitest";
import {
  composeResultSchema,
  MAX_COMPOSE_OPTIONS,
  buildComposePrompt,
  hasUsableRoster,
  parseComposeResult,
  type ComposePromptInput,
} from "./compose-run";
import type { InspectorComponent } from "./inspector";

const comp = (over: Partial<InspectorComponent> & { name: string }): InspectorComponent =>
  ({
    level: "molecule",
    description: "",
    file: `src/${over.name}.tsx`,
    props: [],
    tokens: [],
    status: "built",
    issues: [],
    specPath: null,
    reportPath: null,
    ...over,
  }) as InspectorComponent;

const ROSTER: InspectorComponent[] = [
  comp({ name: "Card", description: "A content card", tokens: ["--space-4", "--radius-md"], variants: ["padding"] }),
  comp({
    name: "Button",
    description: "A primary action",
    props: [{ key: "variant", kind: "enum", options: ["primary", "ghost"], classes: {} }],
  }),
];

const input = (over: Partial<ComposePromptInput> = {}): ComposePromptInput => ({
  runId: "r1",
  roster: ROSTER,
  tokens: ["--space-4", "--radius-md", "--color-accent"],
  designMd: "# Design\nUse generous spacing.",
  intent: "a filters row",
  slot: { anchorLabel: "Card", anchorText: "Featured", position: "before", axis: "row", file: "src/Home.tsx" },
  ...over,
});

const option = (index: number, over: Record<string, unknown> = {}) => ({
  index,
  title: `Option ${index}`,
  axis: "layout",
  componentsUsed: ["Card"],
  ...over,
});

describe("composeResultSchema", () => {
  it("accepts up to three distinct options with provenance", () => {
    const r = composeResultSchema.parse({
      options: [option(0), option(1, { axis: "density" }), option(2, { axis: "components" })],
    });
    expect(r.options).toHaveLength(3);
    expect(r.options[0].componentsUsed).toEqual(["Card"]);
    expect(r.fewerReason).toBeNull();
    expect(r.noMatch).toBeNull();
  });

  it("accepts fewer options with a stated reason (R2)", () => {
    const r = composeResultSchema.parse({
      options: [option(0), option(1)],
      fewerReason: "The roster has only a Card and a Button; a third distinct composition would be a near-duplicate.",
    });
    expect(r.options).toHaveLength(2);
    expect(r.fewerReason).toContain("near-duplicate");
  });

  it("rejects more than three options (the count is never exceeded)", () => {
    expect(() =>
      composeResultSchema.parse({ options: [option(0), option(1), option(2), option(3)] }),
    ).toThrow();
    expect(MAX_COMPOSE_OPTIONS).toBe(3);
  });

  it("accepts a no-component-match result that offers extraction", () => {
    const r = composeResultSchema.parse({
      options: [],
      noMatch: { reason: "No roster component renders a testimonial card.", suggestedName: "TestimonialCard" },
    });
    expect(r.noMatch?.suggestedName).toBe("TestimonialCard");
  });

  it("rejects an empty result that is neither options nor a no-match", () => {
    expect(() => composeResultSchema.parse({ options: [] })).toThrow();
  });

  it("rejects non-contiguous option indices (they key the scaffold markers)", () => {
    expect(() => composeResultSchema.parse({ options: [option(0), option(2)] })).toThrow();
  });

  it("requires a title and an axis on every option", () => {
    expect(() => composeResultSchema.parse({ options: [option(0, { title: "" })] })).toThrow();
    expect(() => composeResultSchema.parse({ options: [option(0, { axis: "" })] })).toThrow();
  });
});

describe("hasUsableRoster", () => {
  it("is false for an empty roster (the no-silent-markup signal)", () => {
    expect(hasUsableRoster([])).toBe(false);
    expect(hasUsableRoster(ROSTER)).toBe(true);
  });
});

describe("buildComposePrompt", () => {
  it("carries the user's intent so the composition reflects what they asked for", () => {
    expect(buildComposePrompt(input({ intent: "a testimonials carousel" }))).toContain("a testimonials carousel");
  });

  it("grounds in the roster, tokens, DESIGN.md, and the anchor's leading text", () => {
    const p = buildComposePrompt(input());
    expect(p).toContain("Card");
    expect(p).toContain("Button");
    expect(p).toContain("variant=[primary|ghost]"); // prop options surfaced
    expect(p).toContain("--space-4"); // token grounding
    expect(p).toContain("Use generous spacing."); // DESIGN.md included
    expect(p).toContain('leading text is "Featured"'); // the disambiguator
    expect(p).toContain("before");
  });

  it("encodes the distinctness discipline and the count ceiling", () => {
    const p = buildComposePrompt(input({ count: 3 }));
    expect(p).toContain("DIFFERENT axis");
    expect(p).toContain("Squint test");
    expect(p).toMatch(/Never exceed 3/);
  });

  it("clamps the requested count into 1..3", () => {
    expect(buildComposePrompt(input({ count: 9 }))).toMatch(/at most 3 option/);
    expect(buildComposePrompt(input({ count: 0 }))).toMatch(/at most 1 option/);
  });

  it("instructs marker-wrapped writes carrying the run id, and a JSON result", () => {
    const p = buildComposePrompt(input({ runId: "run-xyz" }));
    expect(p).toContain("VORTSPEC:COMPOSE:BEGIN run=run-xyz option=N");
    expect(p).toContain("VORTSPEC:COMPOSE:END run=run-xyz option=N");
    expect(p).toContain("```json");
  });

  it("tells the run to escalate ambiguity and refuse generated files", () => {
    const p = buildComposePrompt(input());
    expect(p).toMatch(/MORE THAN ONE location/);
    expect(p).toMatch(/generated, build-output, or git-ignored file/);
    expect(p).toMatch(/stopped/);
    expect(p).toMatch(/no roster component fits/i);
  });

  it("carries the size hint as a soft hint when present", () => {
    const p = buildComposePrompt(input({ sizeHint: { width: 320, height: 120 } }));
    expect(p).toContain("320×120");
    expect(p).toContain("SOFT hint");
  });
});

describe("parseComposeResult", () => {
  it("extracts and validates a fenced JSON result from run output", () => {
    const text = [
      "I composed two options.",
      "```json",
      '{ "options": [ { "index": 0, "title": "A", "axis": "layout", "componentsUsed": ["Card"] } ], "fewerReason": "only one fits", "noMatch": null }',
      "```",
    ].join("\n");
    const r = parseComposeResult(text);
    expect(r?.options).toHaveLength(1);
    expect(r?.fewerReason).toBe("only one fits");
  });

  it("returns null when the JSON is invalid against the contract (e.g. >3 options)", () => {
    const text = '```json\n{ "options": [ {"index":0,"title":"a","axis":"x"},{"index":1,"title":"b","axis":"y"},{"index":2,"title":"c","axis":"z"},{"index":3,"title":"d","axis":"w"} ] }\n```';
    expect(parseComposeResult(text)).toBeNull();
  });

  it("returns null when there is no JSON at all", () => {
    expect(parseComposeResult("I could not do it.")).toBeNull();
  });

  it("parses a no-component-match result", () => {
    const text = '```json\n{ "options": [], "noMatch": { "reason": "nothing fits", "suggestedName": "Hero" } }\n```';
    expect(parseComposeResult(text)?.noMatch?.suggestedName).toBe("Hero");
  });

  it("parses a stopped result (ambiguous/not-found anchor) with candidates", () => {
    const text = '```json\n{ "options": [], "stopped": { "reason": "The anchor matched two <Card> siblings.", "candidates": ["Home.tsx:20", "Home.tsx:41"] } }\n```';
    const r = parseComposeResult(text);
    expect(r?.stopped?.reason).toContain("two <Card>");
    expect(r?.stopped?.candidates).toEqual(["Home.tsx:20", "Home.tsx:41"]);
  });
});
