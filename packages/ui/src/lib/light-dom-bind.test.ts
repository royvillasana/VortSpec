// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { docToLightHtml, lightHtmlToDoc, PAGE_FRAGMENT } from "@vortspec/core/light-doc";
import { readFileSync, readdirSync } from "node:fs";
import { join as joinPath } from "node:path";
import { Window } from "happy-dom";
import { adoptLightDom, adoptLightPage, bindLightDom, LOCAL_ORIGIN } from "./light-dom-bind";

/** Mutation records arrive on a microtask, so every DOM→CRDT assertion has to let one pass. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const PAGE = '<div class="card"><p>hello</p><!-- note --></div>';

const setup = (html = PAGE) => bind(lightHtmlToDoc(html)!);

const bind = (doc: Y.Doc) => {
  const container = document.createElement("main");
  document.body.appendChild(container);
  const binding = bindLightDom(doc, container, document);
  return { doc, container, binding };
};

/**
 * A second window on the same page. It must receive the document rather than parse the file itself:
 * two documents loaded independently from identical bytes are not replicas — they share no history,
 * so merging them concatenates two copies of the page instead of agreeing on one. Whoever opens the
 * page first seeds it; everyone after that syncs. That is a constraint on the eventual session
 * handshake, not a detail of this test.
 */
const join = (from: Y.Doc) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(from));
  return bind(doc);
};

const yRoot = (doc: Y.Doc): Y.XmlElement => doc.getXmlFragment(PAGE_FRAGMENT).get(0) as Y.XmlElement;

describe("rendering the CRDT into the DOM", () => {
  it("builds the tree, comments included", () => {
    const { container } = setup();
    expect(container.innerHTML).toBe(PAGE);
  });

  it("builds nodes itself rather than parsing markup", () => {
    // A table is the standard case where the HTML parser inserts a node nobody wrote — an implied
    // <tbody>. Such a node would have no CRDT counterpart, and every index after it would be off by
    // one, which is how an edit ends up on the wrong element.
    const { container } = setup("<table><tr><td>a</td></tr></table>");
    expect(container.querySelector("tbody")).toBeNull();
    expect(container.innerHTML).toBe("<table><tr><td>a</td></tr></table>");
  });
});

describe("DOM edits reach the document", () => {
  it("carries an attribute change", async () => {
    const { doc, container } = setup();
    container.querySelector("div")!.setAttribute("style", "color: red");
    await settle();
    expect(docToLightHtml(doc)).toBe('<div class="card" style="color: red"><p>hello</p><!-- note --></div>');
  });

  it("carries an attribute removal", async () => {
    const { doc, container } = setup();
    container.querySelector("div")!.removeAttribute("class");
    await settle();
    expect(docToLightHtml(doc)).toBe("<div><p>hello</p><!-- note --></div>");
  });

  it("carries a text edit", async () => {
    const { doc, container } = setup();
    container.querySelector("p")!.firstChild!.nodeValue = "goodbye";
    await settle();
    expect(docToLightHtml(doc)).toContain("<p>goodbye</p>");
  });

  it("carries an inserted subtree", async () => {
    const { doc, container } = setup();
    const added = document.createElement("span");
    added.className = "new";
    added.appendChild(document.createTextNode("x"));
    container.querySelector("div")!.appendChild(added);
    await settle();
    expect(docToLightHtml(doc)).toContain('<span class="new">x</span>');
  });

  it("carries a deletion", async () => {
    const { doc, container } = setup();
    const p = container.querySelector("p")!;
    p.parentNode!.removeChild(p);
    await settle();
    expect(docToLightHtml(doc)).toBe('<div class="card"><!-- note --></div>');
  });

  it("ignores the bridge's own instrumentation", async () => {
    // The inspector marks up the guest DOM with data-vs* attributes. They are stripped on save today
    // and must never enter the document, or every participant would sync one another's selection.
    const { doc, container } = setup();
    container.querySelector("div")!.setAttribute("data-vs-id", "3");
    await settle();
    expect(docToLightHtml(doc)).not.toContain("data-vs-id");
  });

  it("never lets an inline text edit write contenteditable into the page", async () => {
    // The guest sets contenteditable on an element for the duration of an inline text edit, and
    // serializeDom strips it before saving. Without the same exclusion here, editing any text would
    // permanently write contenteditable="true" into the file — quietly, for everyone.
    const { doc, container } = setup();
    const p = container.querySelector("p")!;
    p.setAttribute("contenteditable", "true");
    await settle();
    p.firstChild!.nodeValue = "edited";
    await settle();
    p.removeAttribute("contenteditable");
    await settle();

    const html = docToLightHtml(doc);
    expect(html).toContain("<p>edited</p>");
    expect(html).not.toContain("contenteditable");
  });

  it("inserts at the right index when unmapped nodes are in the way", async () => {
    // An overlay node injected by the canvas is not part of the page. If it were counted, an insert
    // after it would land one position late.
    const { doc, container } = setup();
    const div = container.querySelector("div")!;
    const overlay = document.createElement("i");
    overlay.setAttribute("data-vs-overlay", "");
    div.insertBefore(overlay, div.firstChild);
    await settle();
    const added = document.createElement("b");
    div.insertBefore(added, div.querySelector("p"));
    await settle();
    expect(docToLightHtml(doc)).toBe('<div class="card"><b></b><p>hello</p><!-- note --></div>');
  });
});

describe("document edits reach the DOM", () => {
  it("applies an attribute change", () => {
    const { doc, container } = setup();
    yRoot(doc).setAttribute("style", "color: blue");
    expect(container.querySelector("div")!.getAttribute("style")).toBe("color: blue");
  });

  it("applies an attribute removal", () => {
    const { doc, container } = setup();
    yRoot(doc).removeAttribute("class");
    expect(container.querySelector("div")!.hasAttribute("class")).toBe(false);
  });

  it("applies a text change", () => {
    const { doc, container } = setup();
    const text = (yRoot(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.delete(0, text.length);
    text.insert(0, "remote");
    expect(container.querySelector("p")!.textContent).toBe("remote");
  });

  it("applies an insert at the right position", () => {
    const { doc, container } = setup();
    const el = new Y.XmlElement("b");
    el.setAttribute("id", "r");
    yRoot(doc).insert(0, [el]);
    expect(container.querySelector("div")!.innerHTML).toBe('<b id="r"></b><p>hello</p><!-- note -->');
  });

  it("applies a delete", () => {
    const { doc, container } = setup();
    yRoot(doc).delete(0, 1);
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("no echo loop", () => {
  it("does not turn a remote change into a local one", async () => {
    const { doc, container } = setup();
    const origins: unknown[] = [];
    doc.on("update", (_u: Uint8Array, origin: unknown) => origins.push(origin));
    yRoot(doc).setAttribute("style", "color: blue");
    await settle();
    // The DOM mutation this caused is seen by the observer and produces no operation, so no update
    // carries it back out. An update tagged LOCAL_ORIGIN here is the thing two peers would trade
    // forever. (Watching updates rather than transactions is the point: an empty transaction is
    // harmless, an emitted update is not.)
    expect(origins.filter((o) => o === LOCAL_ORIGIN)).toHaveLength(0);
    expect(docToLightHtml(doc)).toContain('style="color: blue"');
  });

  it("settles when two bound documents are synced to each other", async () => {
    // The shape of two windows on one page: an edit in A must reach B and stop, not ricochet.
    const a = setup();
    const b = join(a.doc);
    let transactions = 0;
    const wire = (from: Y.Doc, to: Y.Doc): void => {
      from.on("update", (update: Uint8Array, origin: unknown) => {
        transactions += 1;
        if (origin === "sync") return;
        Y.applyUpdate(to, update, "sync");
      });
    };
    wire(a.doc, b.doc);
    wire(b.doc, a.doc);

    a.container.querySelector("div")!.setAttribute("style", "color: red");
    await settle();
    await settle();

    expect(b.container.querySelector("div")!.getAttribute("style")).toBe("color: red");
    expect(docToLightHtml(a.doc)).toBe(docToLightHtml(b.doc));
    // A bounded number of updates: one out of A, one applied into B. An echo loop shows up here as
    // an unbounded count rather than as a wrong value.
    expect(transactions).toBeLessThanOrEqual(4);
  });

  it("keeps both windows correct when each edits a different element", async () => {
    const a = setup();
    const b = join(a.doc);
    const wire = (from: Y.Doc, to: Y.Doc): void => {
      from.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin === "sync") return;
        Y.applyUpdate(to, update, "sync");
      });
    };
    wire(a.doc, b.doc);
    wire(b.doc, a.doc);

    a.container.querySelector("div")!.setAttribute("style", "color: red");
    b.container.querySelector("p")!.setAttribute("id", "para");
    await settle();
    await settle();

    const html = docToLightHtml(a.doc);
    expect(html).toContain('style="color: red"');
    expect(html).toContain('id="para"');
    expect(docToLightHtml(b.doc)).toBe(html);
  });
});

describe("destroy", () => {
  it("stops syncing in both directions", async () => {
    const { doc, container, binding } = setup();
    binding.destroy();
    container.querySelector("div")!.setAttribute("style", "color: red");
    await settle();
    expect(docToLightHtml(doc)).not.toContain("color: red");
    yRoot(doc).setAttribute("id", "x");
    expect(container.querySelector("div")!.hasAttribute("id")).toBe(false);
  });
});

describe("adopting a DOM the browser already rendered", () => {
  /** What the guest actually has: the page parsed by the browser, plus a document from the file. */
  const rendered = (html: string) => {
    const container = document.createElement("main");
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
  };

  it("pairs with the live tree without rebuilding it", () => {
    const doc = lightHtmlToDoc(PAGE)!;
    const container = rendered(PAGE);
    const before = container.firstChild;

    const binding = adoptLightDom(doc, container, document);

    expect(binding).not.toBeNull();
    // The very same nodes: nothing on screen was replaced, which is the whole point of adopting.
    expect(container.firstChild).toBe(before);
    expect(container.innerHTML).toBe(PAGE);
  });

  it("syncs both ways once adopted", async () => {
    const doc = lightHtmlToDoc(PAGE)!;
    const container = rendered(PAGE);
    adoptLightDom(doc, container, document);

    container.querySelector("div")!.setAttribute("style", "color: red");
    await settle();
    expect(docToLightHtml(doc)).toContain('style="color: red"');

    yRoot(doc).setAttribute("id", "remote");
    expect(container.querySelector("div")!.getAttribute("id")).toBe("remote");
  });

  it("refuses when the browser inserted a node nobody wrote", () => {
    // The implied <tbody>: the file says table > tr, the DOM says table > tbody > tr. Pairing those
    // would put every later index one level off, so the page is left uncollaborative instead.
    const doc = lightHtmlToDoc("<table><tr><td>a</td></tr></table>")!;
    const container = rendered("<table><tr><td>a</td></tr></table>");
    expect(container.querySelector("tbody")).not.toBeNull();
    expect(adoptLightDom(doc, container, document)).toBeNull();
  });

  it("refuses when the live page has drifted from the file", () => {
    const doc = lightHtmlToDoc(PAGE)!;
    const container = rendered(PAGE);
    container.querySelector("div")!.appendChild(document.createElement("span"));
    expect(adoptLightDom(doc, container, document)).toBeNull();
  });

  it("ignores canvas instrumentation when pairing", () => {
    // The inspector's overlay is in the live DOM and never in the file. If it were counted, no page
    // with a selection on it could ever go live.
    const doc = lightHtmlToDoc(PAGE)!;
    const container = rendered(PAGE);
    const overlay = document.createElement("div");
    overlay.setAttribute("data-vs-overlay", "");
    container.appendChild(overlay);
    expect(adoptLightDom(doc, container, document)).not.toBeNull();
  });

  it("refuses a real page whose live document has drifted", () => {
    // Guards the test above from being vacuous: whole-document adoption has to be actually looking
    // at the rendered tree, not just finding an <html> and declaring success.
    const dir = joinPath(process.cwd(), "../core/src/shared/__fixtures__/light-pages");
    const file = readdirSync(dir).filter((f) => f.endsWith(".html"))[0]!;
    const src = readFileSync(joinPath(dir, file), "utf8");

    const win = new Window();
    win.document.write(src);
    win.document.body.appendChild(win.document.createElement("aside"));

    expect(adoptLightPage(lightHtmlToDoc(src)!, win.document as unknown as Document)).toBeNull();
  });

  it("adopts every real light page, as a whole document", () => {
    // Through the browser's own parser, into a real `document` — which is what the guest has. An
    // earlier version of this test set a full page as the innerHTML of an element, where the parser
    // silently discards <html>, <head> and <body>; it therefore proved nothing at all.
    const dir = joinPath(process.cwd(), "../core/src/shared/__fixtures__/light-pages");
    const files = readdirSync(dir).filter((f) => f.endsWith(".html"));
    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const file of files) {
      const src = readFileSync(joinPath(dir, file), "utf8");
      const win = new Window();
      win.document.write(src);
      const doc = lightHtmlToDoc(src);
      expect(doc, file).not.toBeNull();
      expect(
        adoptLightPage(doc!, win.document as unknown as Document),
        `${file} should adopt`,
      ).not.toBeNull();
    }
  });
});
