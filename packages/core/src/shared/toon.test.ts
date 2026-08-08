import { describe, expect, it } from "vitest";
import { parseToon, splitToonRow, toonRoundTrip, writeToon, type ToonValue } from "./toon";

/**
 * The TOON writer and its parser — OpenSpec change: agentic-design-system, task 2.6, which asks for
 * round-trip tests specifically.
 *
 * The round trip is the point. A format we can write but not read is a format we cannot test, and
 * the whole value of these artifacts is that a model reads them and gets the RIGHT data — a quoting
 * bug that splits one row into the wrong number of columns is silent, and would poison every answer
 * downstream while the file still looked fine.
 */

describe("writing TOON", () => {
  it("writes a uniform array as one header plus a row each — the token saving", () => {
    const text = writeToon({
      components: [
        { name: "Button", path: "src/Button.tsx", tier: "atom" },
        { name: "Card", path: "src/Card.tsx", tier: "molecule" },
      ],
    });
    expect(text).toBe(
      ["components[2]{name,path,tier}:", "  Button,src/Button.tsx,atom", "  Card,src/Card.tsx,molecule", ""].join("\n"),
    );
    // The key set is written ONCE, not per element — where the 30–60% claim comes from.
    expect((text.match(/name/g) ?? []).length).toBe(1);
  });

  it("writes an empty array as a declared zero, not an omission", () => {
    // `components[0]:` says "we looked and there are none". A missing key says nothing at all, and a
    // reader cannot tell it from a section the writer forgot.
    expect(writeToon({ components: [] })).toBe("components[0]:\n");
  });

  it("writes a primitive array inline with its length", () => {
    expect(writeToon({ tokens: ["a", "b", "c"] })).toBe("tokens[3]: a,b,c\n");
  });

  it("nests objects by indentation", () => {
    expect(writeToon({ stats: { total: 3, atoms: 1 } })).toBe("stats:\n  total: 3\n  atoms: 1\n");
  });
});

describe("quoting is the correctness story (task 2.6)", () => {
  it("quotes a value containing the delimiter — a design system is full of them", () => {
    // `font-family: "Inter", sans-serif` and any box-shadow would otherwise split one row into the
    // wrong number of columns, silently shifting every value after it.
    const value = { tokens: [{ name: "font-body", value: "Inter, sans-serif" }] };
    expect(writeToon(value)).toContain('"Inter, sans-serif"');
    expect(toonRoundTrip(value)).toEqual(value);
  });

  it("round-trips a real box-shadow, commas and all", () => {
    const value = {
      tokens: [{ name: "shadow-md", value: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)" }],
    };
    expect(toonRoundTrip(value)).toEqual(value);
  });

  it("quotes a string that would otherwise decode as another type", () => {
    // Without this, the string "true" comes back as a boolean and "42" as a number.
    const value = { rows: [{ a: "true", b: "42", c: "null", d: "" }] };
    const back = parseToon(writeToon(value)) as { rows: Record<string, ToonValue>[] };
    expect(back.rows[0]).toEqual({ a: "true", b: "42", c: "null", d: "" });
  });

  it("preserves real types through the round trip", () => {
    const value = { rows: [{ a: true, b: 42, c: null, d: -1.5 }] };
    expect(toonRoundTrip(value)).toEqual(value);
  });

  it("round-trips embedded quotes and newlines", () => {
    const value = { rows: [{ code: 'const x = "hi";\nreturn x;' }] };
    expect(toonRoundTrip(value)).toEqual(value);
  });

  it("preserves leading and trailing whitespace rather than trimming it away", () => {
    expect(toonRoundTrip({ rows: [{ v: "  padded  " }] })).toEqual({ rows: [{ v: "  padded  " }] });
  });
});

describe("splitToonRow", () => {
  it("splits on the delimiter but not inside quotes", () => {
    expect(splitToonRow('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });
  it("unescapes a quoted quote", () => {
    expect(splitToonRow('"say \\"hi\\""')).toEqual(['say "hi"']);
  });
});

describe("parsing refuses what it cannot represent (task 2.6)", () => {
  // A lenient parser that dropped a malformed line would make the round-trip test pass on data it
  // had quietly discarded — the one failure a round-trip test must not have.
  it("throws when a declared row count does not match the rows present", () => {
    expect(() => parseToon("components[3]{name}:\n  Button\n  Card\n")).toThrow(/declares 3 rows/);
  });

  it("throws when a row has the wrong number of cells", () => {
    expect(() => parseToon("components[1]{name,path}:\n  Button\n")).toThrow(/expected 2/);
  });

  it("throws on a line it cannot parse at all", () => {
    expect(() => parseToon("this is not toon\n")).toThrow(/cannot parse/);
  });

  it("throws when a primitive list's length disagrees with its items", () => {
    expect(() => parseToon("tokens[5]: a,b\n")).toThrow(/declares 5 items/);
  });
});

describe("round-tripping a whole artifact", () => {
  it("survives the shape the index artifacts actually use", () => {
    const artifact: Record<string, ToonValue> = {
      generatedAt: "2026-08-07T12:00:00.000Z",
      project: "VortSpec",
      stats: { components: 3, adopted: 2 },
      components: [
        { name: "Button", path: "src/components/Button.tsx", tier: "atom", instances: 7, adoption: "adopted" },
        { name: "Card", path: "src/components/Card.tsx", tier: "molecule", instances: 1, adoption: "adopted" },
        { name: "Badge", path: "src/components/Badge.tsx", tier: "atom", instances: 0, adoption: "unimported" },
      ],
      unused: ["Badge"],
      empty: [],
    };
    expect(toonRoundTrip(artifact)).toEqual(artifact);
  });

  it("is stable — writing the same data twice produces identical bytes", () => {
    // The artifacts are committed and reviewed in a diff, so an unstable writer would show a change
    // on every build and train everyone to ignore the diff.
    const artifact = { components: [{ name: "Button", path: "src/Button.tsx" }] };
    expect(writeToon(artifact)).toBe(writeToon(artifact));
  });
});
