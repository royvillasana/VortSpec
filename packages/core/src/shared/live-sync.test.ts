import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { canAdoptLightHtml, docToLightHtml, loadLightHtml, PAGE_FRAGMENT } from "./light-doc";

/**
 * Document sync between participants (OpenSpec change: live-playground, tasks 3.2–3.5).
 *
 * These model a relay rather than mocking one: a room holds whatever peers have sent it, and a peer
 * that connects receives it. That is enough to exercise the decisions that matter — who seeds, what
 * a late joiner sees, and whether concurrent edits survive each other.
 */

const PAGE = [
  "<!doctype html>",
  '<html lang="en">',
  "<body>",
  '  <header class="top"><h1>Title</h1></header>',
  '  <main><p id="intro">Intro copy</p><ul><li>one</li><li>two</li></ul></main>',
  "</body>",
  "</html>",
].join("\n");

/** A room: the relay's copy, and the peers attached to it. */
const room = () => {
  const relay = new Y.Doc();
  const peers: Y.Doc[] = [];
  return {
    /**
     * A client joining: it receives the room's current state, THEN decides whether to seed. This is
     * the handshake `settleLive` implements — seeding before the relay has spoken would overwrite
     * everyone's work with the file on disk.
     */
    join(html: string): Y.Doc {
      const doc = new Y.Doc();
      // Attached to the relay BEFORE seeding, matching the real order: the provider is already
      // connected when `settleLive` runs, so a seed is broadcast rather than kept to one client.
      // Subscribing afterwards would leave the first peer's page invisible to everyone — and the
      // second peer would seed too, producing exactly the duplicated document this guards against.
      doc.on("update", (update: Uint8Array) => Y.applyUpdate(relay, update));
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(relay));
      if (doc.getXmlFragment(PAGE_FRAGMENT).length === 0) loadLightHtml(doc, html);
      peers.push(doc);
      return doc;
    },
    /** Everyone catches up with the relay, in any order. */
    sync(): void {
      for (const p of peers) Y.applyUpdate(relay, Y.encodeStateAsUpdate(p));
      for (const p of peers) Y.applyUpdate(p, Y.encodeStateAsUpdate(relay));
    },
  };
};

const find = (doc: Y.Doc, tag: string): Y.XmlElement => {
  const walk = (node: Y.XmlFragment | Y.XmlElement): Y.XmlElement | null => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === tag) return child;
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  return walk(doc.getXmlFragment(PAGE_FRAGMENT))!;
};

describe("who seeds the page", () => {
  it("gives two participants ONE page, not two", () => {
    // The failure this handshake exists to prevent. Two peers that each parse the file hold
    // documents with no shared history, and merging them concatenates the page with itself — every
    // element twice, which is not a subtle corruption but is a silent one.
    const r = room();
    const a = r.join(PAGE);
    const b = r.join(PAGE);
    r.sync();

    expect(docToLightHtml(a)).toBe(PAGE);
    expect(docToLightHtml(b)).toBe(PAGE);
    expect(docToLightHtml(a).match(/<h1>/g)?.length).toBe(1);
  });

  it("gives a late joiner the edits made before they arrived", () => {
    const r = room();
    const a = r.join(PAGE);
    find(a, "header").setAttribute("style", "background: red");
    r.sync();

    const late = r.join(PAGE);
    expect(docToLightHtml(late)).toContain('style="background: red"');
    expect(docToLightHtml(late)).toBe(docToLightHtml(a));
  });

  it("does not let a late joiner overwrite the room with the file on disk", () => {
    // The dangerous direction: their file is the ORIGINAL, so seeding would revert everyone.
    const r = room();
    const a = r.join(PAGE);
    find(a, "p").setAttribute("style", "color: red");
    r.sync();

    r.join(PAGE);
    r.sync();
    expect(docToLightHtml(a)).toContain('style="color: red"');
  });
});

describe("concurrent editing", () => {
  it("keeps both edits when two people touch different elements", () => {
    const r = room();
    const a = r.join(PAGE);
    const b = r.join(PAGE);
    r.sync();

    find(a, "header").setAttribute("style", "background: red");
    find(b, "p").setAttribute("style", "font-size: 18px");
    r.sync();

    const html = docToLightHtml(a);
    expect(html).toContain("background: red");
    expect(html).toContain("font-size: 18px");
    expect(docToLightHtml(b)).toBe(html);
  });

  it("converges with three participants, including an insert and a delete", () => {
    const r = room();
    const a = r.join(PAGE);
    const b = r.join(PAGE);
    const c = r.join(PAGE);
    r.sync();

    const added = new Y.XmlElement("li");
    const text = new Y.XmlText();
    text.insert(0, "three");
    added.insert(0, [text]);
    find(a, "ul").insert(2, [added]);
    find(b, "ul").delete(0, 1);
    find(c, "h1").setAttribute("style", "font-weight: 900");
    r.sync();

    const html = docToLightHtml(a);
    expect(docToLightHtml(b)).toBe(html);
    expect(docToLightHtml(c)).toBe(html);
    expect(html).toContain("<li>three</li>");
    expect(html).not.toContain("<li>one</li>");
    expect(html).toContain("font-weight: 900");
  });

  it("does not misdirect an edit when a concurrent insert moves an element", () => {
    // Anchor drift, which is why position is derived from the tree rather than synced as a number.
    // A stale line:column would still resolve — to the WRONG element.
    const r = room();
    const a = r.join(PAGE);
    const b = r.join(PAGE);
    r.sync();

    const target = find(b, "p"); // captured before the insert above it
    const banner = new Y.XmlElement("div");
    banner.setAttribute("class", "banner");
    find(a, "body").insert(0, [banner]);

    target.setAttribute("data-edited", "yes");
    r.sync();

    expect(docToLightHtml(a)).toContain('<p id="intro" data-edited="yes">');
    expect(docToLightHtml(b)).toBe(docToLightHtml(a));
  });

  it("still writes a file the original can be diffed against", () => {
    const r = room();
    const a = r.join(PAGE);
    const b = r.join(PAGE);
    r.sync();
    find(a, "header").setAttribute("style", "background: red");
    find(b, "p").setAttribute("style", "font-size: 18px");
    r.sync();

    expect(canAdoptLightHtml(docToLightHtml(a))).toBe(true);
    expect(docToLightHtml(a)).toBe(
      PAGE.replace('<header class="top">', '<header class="top" style="background: red">').replace(
        '<p id="intro">',
        '<p id="intro" style="font-size: 18px">',
      ),
    );
  });
});
