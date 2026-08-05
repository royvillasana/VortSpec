import { describe, it, expect } from "vitest";
import {
  attrValue,
  canRoundTrip,
  makeRawSuffix,
  parseLightHtml,
  serializeLightHtml,
} from "./light-html";

const roundTrip = (src: string): string | null => {
  const tree = parseLightHtml(src);
  return tree === null ? null : serializeLightHtml(tree);
};

describe("light-html fidelity", () => {
  // Each of these is a shape a normalising parser would silently rewrite. A rewrite means the first
  // collaborative edit to a page lands in git as a whole-file reformat, which is why they are tested
  // one by one rather than as one blob.
  const exact: Array<[string, string]> = [
    ["doctype line", "<!doctype html>\n<html></html>"],
    ["uppercase doctype", "<!DOCTYPE html>\n<html></html>"],
    ["attribute order", '<div class="a" id="b" data-component="Card"></div>'],
    ["attributes across lines", '<div\n  class="a"\n  style="color: red"\n>x</div>'],
    ["single quotes", "<div class='a'></div>"],
    ["unquoted value", "<div class=a></div>"],
    ["boolean attribute", "<input disabled>"],
    ["empty-string attribute", '<link crossorigin="">'],
    ["space before close", "<div  ></div>"],
    ["void without slash", "<br>"],
    ["void with slash", "<br />"],
    ["void with tight slash", "<img src='a'/>"],
    ["comment", "<!-- a comment --><div></div>"],
    ["comment containing markup", "<!-- <div> --><p></p>"],
    ["entity in text", "<p>clothes &amp; gear</p>"],
    ["entity in attribute", '<a href="?a=1&amp;b=2"></a>'],
    ["whitespace between siblings", "<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>"],
    ["style block with child combinator", "<style>\n  .a > .b { color: red }\n</style>"],
    ["script with comparison", "<script>if (a < b) { x() }</script>"],
    ["empty raw element", "<style></style>"],
    ["spaces around equals", '<div class = "a"></div>'],
    ["nbsp entity", "<p>a&nbsp;b</p>"],
  ];

  for (const [name, src] of exact) {
    it(`preserves ${name}`, () => {
      expect(roundTrip(src)).toBe(src);
      expect(canRoundTrip(src)).toBe(true);
    });
  }

  it("keeps a style block's contents verbatim, markup and all", () => {
    const src = "<style>\n  a::after { content: '<b>' }\n</style>";
    expect(roundTrip(src)).toBe(src);
  });

  it("does not treat </styles> as the end of a <style>", () => {
    const src = "<style>.a{}</style><p>after</p>";
    const tree = parseLightHtml(src);
    expect(tree).not.toBeNull();
    expect(tree!.length).toBe(2);
  });
});

describe("light-html refusal", () => {
  // Refusing is the safety property the whole feature rests on: a page that is not understood
  // completely is left on today's write path rather than being reformatted into one we can handle.
  const refused: Array<[string, string]> = [
    ["an omitted end tag", "<ul><li>a<li>b</ul>"],
    ["a stray end tag", "<div></div></span>"],
    ["mis-nesting", "<b><i>x</b></i>"],
    ["an unclosed element", "<div><p>x</p>"],
    ["an unterminated comment", "<!-- never ends"],
    ["an unterminated tag", "<div class='a'"],
    ["a case-shifted end tag", "<div></DIV>"],
  ];

  for (const [what, src] of refused) {
    it(`refuses ${what}`, () => {
      expect(canRoundTrip(src)).toBe(false);
    });
  }

  it("refuses rather than swallowing a stray end tag as text", () => {
    // This one is the trap: parsed as text it would round-trip byte-identically while modelling the
    // document wrongly, so a byte comparison alone would wave it through.
    expect(parseLightHtml("<div></div></span>")).toBeNull();
  });
});

describe("attribute values", () => {
  it("decodes what an edit reads", () => {
    expect(attrValue('="a &amp; b"')).toBe("a & b");
    expect(attrValue("='single'")).toBe("single");
    expect(attrValue("=bare")).toBe("bare");
    expect(attrValue("")).toBe("");
    expect(attrValue(' = "spaced"')).toBe("spaced");
  });

  it("re-encodes what an edit writes", () => {
    expect(makeRawSuffix("a & b")).toBe('="a &amp; b"');
    expect(makeRawSuffix('say "hi"')).toBe('="say &quot;hi&quot;"');
  });

  it("survives a decode/encode round trip", () => {
    for (const value of ["plain", "a & b", '"quoted"', "<tag>", "color: red; margin: 0"]) {
      expect(attrValue(makeRawSuffix(value))).toBe(value);
    }
  });
});
