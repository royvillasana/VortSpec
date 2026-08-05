/**
 * The property the whole change rests on (OpenSpec change: live-playground, task 1.4).
 *
 * The spec's load-bearing claim is that "an edit to one element SHALL NOT discard a concurrent edit to
 * a different element". These tests assert it for the CRDT — and then assert the opposite for the way
 * light pages are written today, because a claim about an improvement is only worth as much as the
 * demonstration that the old behaviour really was broken. The second half of this file is the reason
 * `instant-canvas-edits` had to be modified rather than merely extended.
 */
import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { docToLightHtml, lightHtmlToDoc, PAGE_FRAGMENT } from "./light-doc";

const PAGE = [
  "<!doctype html>",
  '<html lang="en">',
  "<body>",
  '  <header class="top"><h1>Title</h1></header>',
  '  <main class="content">',
  '    <p id="intro">Intro copy</p>',
  '    <ul class="list"><li>one</li><li>two</li></ul>',
  "  </main>",
  "</body>",
  "</html>",
].join("\n");

/** A peer that received the document rather than parsing the file — see `light-dom-bind.test.ts`. */
const replicaOf = (source: Y.Doc): Y.Doc => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(source));
  return doc;
};

/** Exchange everything each peer knows with every other, in any order. */
const mergeAll = (docs: Y.Doc[]): void => {
  for (const from of docs) {
    const update = Y.encodeStateAsUpdate(from);
    for (const to of docs) if (to !== from) Y.applyUpdate(to, update);
  }
};

const find = (doc: Y.Doc, predicate: (el: Y.XmlElement) => boolean): Y.XmlElement => {
  const hits: Y.XmlElement[] = [];
  const walk = (node: Y.XmlFragment | Y.XmlElement): void => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlElement) {
        if (predicate(child)) hits.push(child);
        walk(child);
      }
    }
  };
  walk(doc.getXmlFragment(PAGE_FRAGMENT));
  return hits[0]!;
};

const byTag = (doc: Y.Doc, tag: string): Y.XmlElement => find(doc, (el) => el.nodeName === tag);

const textNode = (value: string): Y.XmlText => {
  const text = new Y.XmlText();
  text.insert(0, value);
  return text;
};

describe("concurrent edits converge", () => {
  it("keeps both when two people edit different elements", () => {
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);

    byTag(a, "header").setAttribute("style", "background: red");
    byTag(b, "p").setAttribute("style", "font-size: 18px");
    mergeAll([a, b]);

    const html = docToLightHtml(a);
    expect(html).toContain('style="background: red"');
    expect(html).toContain('style="font-size: 18px"');
    expect(docToLightHtml(b)).toBe(html);
  });

  it("keeps both when two people edit different attributes of the SAME element", () => {
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);

    byTag(a, "p").setAttribute("style", "color: red");
    byTag(b, "p").setAttribute("class", "lede");
    mergeAll([a, b]);

    const html = docToLightHtml(a);
    expect(html).toContain('style="color: red"');
    expect(html).toContain('class="lede"');
    // Byte equality between the two peers, not just agreement about the value set. Attributes an edit
    // introduced arrive in whatever order updates happened to reach each replica, so without a
    // deterministic order the two participants would write the same page as two different files —
    // and the second one to save would see a git diff nobody made.
    expect(docToLightHtml(b)).toBe(html);
  });

  it("converges with three people editing at once", () => {
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);
    const c = replicaOf(a);

    byTag(a, "h1").setAttribute("style", "font-weight: 900");
    byTag(b, "ul").setAttribute("style", "gap: 8px");
    byTag(c, "p").setAttribute("id", "lede");
    mergeAll([a, b, c]);

    const html = docToLightHtml(a);
    expect(docToLightHtml(b)).toBe(html);
    expect(docToLightHtml(c)).toBe(html);
    expect(html).toContain("font-weight: 900");
    expect(html).toContain("gap: 8px");
    expect(html).toContain('id="lede"');
  });

  it("converges on inserts and deletes — the operations most likely to break a tree merge", () => {
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);

    const added = new Y.XmlElement("li");
    added.insert(0, [textNode("three")]);
    byTag(a, "ul").insert(2, [added]);
    byTag(b, "ul").delete(0, 1); // removes "one"
    mergeAll([a, b]);

    const html = docToLightHtml(a);
    expect(docToLightHtml(b)).toBe(html);
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<li>three</li>");
    expect(html).not.toContain("<li>one</li>");
  });

  it("does not misdirect an edit when a concurrent insert moves an element", () => {
    // The anchor-drift bug in one test. Today an edit anchors to `relPath:line:column`, so inserting
    // a sibling above an element shifts every line below it and a later edit resolves to the wrong
    // element — a stale line number still points at *something*. Here the reference IS the element,
    // so it cannot be shifted onto its neighbour.
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);

    const target = byTag(b, "p"); // captured before the concurrent insert
    const banner = new Y.XmlElement("div");
    banner.setAttribute("class", "banner");
    byTag(a, "body").insert(0, [banner]);

    target.setAttribute("data-edited", "yes");
    mergeAll([a, b]);

    const html = docToLightHtml(a);
    expect(html).toContain('<p id="intro" data-edited="yes">');
    expect(html).toContain('<div class="banner"></div>');
    expect(docToLightHtml(b)).toBe(html);
  });

  it("leaves the rest of the file byte-identical", () => {
    // A collaborative edit must still produce a reviewable diff: one attribute, not a reformat.
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);
    byTag(a, "header").setAttribute("style", "background: red");
    byTag(b, "p").setAttribute("style", "font-size: 18px");
    mergeAll([a, b]);

    expect(docToLightHtml(a)).toBe(
      PAGE.replace('<header class="top">', '<header class="top" style="background: red">').replace(
        '<p id="intro">',
        '<p id="intro" style="font-size: 18px">',
      ),
    );
  });
});

describe("the model this replaces", () => {
  /**
   * Today: an edit mutates the live DOM, and a debounced `serializeDom()` writes the WHOLE document
   * over the file. Two participants therefore each write a complete page, and the file ends up as
   * whoever wrote last — with everyone else's work in it nowhere. This is not a race in a corner
   * case; it is the normal outcome of two people editing at the same time.
   */
  const HEADER_EDIT: [string, string] = [
    '<header class="top">',
    '<header class="top" style="background: red">',
  ];
  const PARA_EDIT: [string, string] = ['<p id="intro">', '<p id="intro" style="font-size: 18px">'];

  /**
   * Each participant edits their own copy of the page and then writes their whole copy over the file.
   * Nobody merges, because nothing in that path can: the unit of the write is the entire document.
   */
  const snapshotWrite = (edits: Array<[string, string]>): string => {
    let file = PAGE;
    for (const [from, to] of edits) file = PAGE.replace(from, to);
    return file;
  };

  it("loses an edit that the CRDT keeps", () => {
    const file = snapshotWrite([HEADER_EDIT, PARA_EDIT]);
    // The second writer's edit is there; the first writer's is simply gone.
    expect(file).toContain('style="font-size: 18px"');
    expect(file).not.toContain("background: red");
  });

  it("loses the same edit regardless of who writes last", () => {
    const file = snapshotWrite([PARA_EDIT, HEADER_EDIT]);
    expect(file).toContain("background: red");
    expect(file).not.toContain("font-size: 18px");
  });

  it("is the same pair of edits the CRDT keeps both of", () => {
    // Tying the two halves together, so this cannot quietly become a comparison of two different
    // scenarios: the exact edits lost above are the ones kept below.
    const a = lightHtmlToDoc(PAGE)!;
    const b = replicaOf(a);
    byTag(a, "header").setAttribute("style", "background: red");
    byTag(b, "p").setAttribute("style", "font-size: 18px");
    mergeAll([a, b]);
    expect(docToLightHtml(a)).toBe(PAGE.replace(...HEADER_EDIT).replace(...PARA_EDIT));
  });
});
