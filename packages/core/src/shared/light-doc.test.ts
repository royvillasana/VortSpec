import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Y from "yjs";
import {
  canAdoptLightHtml,
  docToLightHtml,
  lightHtmlToDoc,
  loadLightHtml,
  PAGE_FRAGMENT,
} from "./light-doc";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__/light-pages");
const pages = readdirSync(FIXTURES).filter((f) => f.endsWith(".html"));

/**
 * These four are real pages, composed by the product and written by the canvas `serializeDom` — not
 * hand-written samples chosen to pass. They are the reason the parser is source-faithful instead of
 * spec-compliant: between them they carry multi-line attributes, `crossorigin=""`, entity-encoded
 * hrefs, `<style>` blocks full of `>` combinators, and comment banners.
 */
describe("real light pages survive the CRDT byte for byte", () => {
  it("has fixtures to test", () => {
    expect(pages.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of pages) {
    it(name, () => {
      const src = readFileSync(join(FIXTURES, name), "utf8");
      expect(canAdoptLightHtml(src)).toBe(true);
      const doc = lightHtmlToDoc(src);
      expect(doc).not.toBeNull();
      expect(docToLightHtml(doc!)).toBe(src);
    });
  }

  it("keeps a hand-written page's attribute forms exactly as written", () => {
    // The four fixtures were all written out by the canvas, so every attribute in them is already in
    // canonical form — double-quoted, entity-encoded — and they pass even if the CRDT regenerates
    // every attribute from its value. A page a person typed is what distinguishes the two. Without
    // this, "byte-identical" would hold only for pages we had already rewritten once.
    const src = [
      "<!doctype html>",
      "<html lang=en>",
      "<body>",
      "  <input disabled>",
      "  <div class='card' data-n=3 title = \"spaced\">hi</div>",
      "</body>",
      "</html>",
    ].join("\n");
    expect(canAdoptLightHtml(src)).toBe(true);
    expect(docToLightHtml(lightHtmlToDoc(src)!)).toBe(src);
  });

  it("survives a trip through the wire format", () => {
    // What a peer receives is an update, not the document — so the encode/decode path has to preserve
    // fidelity too, or the file would differ depending on who wrote it.
    const src = readFileSync(join(FIXTURES, pages[0]!), "utf8");
    const a = lightHtmlToDoc(src)!;
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(docToLightHtml(b)).toBe(src);
  });
});

describe("editing through the document", () => {
  const page = '<!doctype html>\n<html>\n<body>\n  <div\n    class="card"\n    style="color: red"\n  >hi</div>\n</body>\n</html>';

  const firstDiv = (doc: Y.Doc): Y.XmlElement => {
    const found: Y.XmlElement[] = [];
    const walk = (node: Y.XmlFragment | Y.XmlElement): void => {
      for (const child of node.toArray()) {
        if (child instanceof Y.XmlElement) {
          if (child.nodeName === "div") found.push(child);
          walk(child);
        }
      }
    };
    walk(doc.getXmlFragment(PAGE_FRAGMENT));
    return found[0]!;
  };

  it("rewrites only the attribute that changed, leaving the file's shape alone", () => {
    const doc = lightHtmlToDoc(page)!;
    firstDiv(doc).setAttribute("style", "color: blue");
    const out = docToLightHtml(doc);
    // The multi-line attribute layout is untouched; one value moved.
    expect(out).toBe(page.replace('style="color: red"', 'style="color: blue"'));
  });

  it("adds an attribute an edit introduced, in the element's own formatting", () => {
    const doc = lightHtmlToDoc(page)!;
    firstDiv(doc).setAttribute("data-component", "Card");
    // This element breaks its attributes across lines, so the new one goes on a line too — the diff
    // is one added line rather than one rewritten line.
    expect(docToLightHtml(doc)).toBe(
      page.replace('style="color: red"', 'style="color: red"\n    data-component="Card"'),
    );
  });

  it("adds an attribute after a space when the element is written on one line", () => {
    const doc = lightHtmlToDoc('<div class="a"></div>')!;
    firstDiv(doc).setAttribute("id", "b");
    expect(docToLightHtml(doc)).toBe('<div class="a" id="b"></div>');
  });

  it("drops an attribute an edit removed", () => {
    const doc = lightHtmlToDoc(page)!;
    firstDiv(doc).removeAttribute("style");
    const out = docToLightHtml(doc);
    expect(out).not.toContain("color: red");
    expect(out).toContain('class="card"');
  });

  it("escapes a value that would otherwise break the markup", () => {
    const doc = lightHtmlToDoc(page)!;
    firstDiv(doc).setAttribute("title", 'a "b" & c');
    expect(docToLightHtml(doc)).toContain('title="a &quot;b&quot; &amp; c"');
  });
});

describe("adoption gate", () => {
  it("refuses a page it cannot reproduce exactly", () => {
    expect(canAdoptLightHtml("<ul><li>a<li>b</ul>")).toBe(false);
    expect(lightHtmlToDoc("<ul><li>a<li>b</ul>")).toBeNull();
  });

  it("leaves the document untouched when it refuses", () => {
    const doc = new Y.Doc();
    expect(loadLightHtml(doc, "<div>ok</div>")).toBe(true);
    expect(loadLightHtml(doc, "<div>broken")).toBe(false);
    expect(docToLightHtml(doc)).toBe("<div>ok</div>");
  });

  it("refuses a page that already contains the reserved formatting attribute", () => {
    // Impossible from `serializeDom`, which strips every `data-vs*` — but adopting it would let a
    // page overwrite its own formatting record.
    expect(canAdoptLightHtml('<div data-vs-fmt="{}"></div>')).toBe(false);
  });
});
