/**
 * A source-faithful HTML tree for light pages (OpenSpec change: live-playground, task 1.1).
 *
 * Why not a spec-compliant parser: this tree exists so a light page can be modelled as a CRDT and
 * written back from converged state. If parsing and reserializing a page rewrote its formatting, the
 * first collaborative edit to any page would land in git as a whole-file diff — the page reformatted
 * around one changed colour. Reviewing that is impossible, and this product reviews everything through
 * git. So the tree preserves what a normalising parser throws away: attribute order, the exact
 * whitespace between attributes (formatted pages break attributes across lines), the quote character,
 * boolean attributes with no value, `<br>` vs `<br />`, comments, and the doctype line verbatim.
 *
 * The bargain that makes that safe: `parseLightHtml` returns `null` rather than guessing. Omitted end
 * tags, stray end tags, mis-nesting — anything this parser does not fully model — is refused, and the
 * caller falls back to today's whole-document write. A page is only ever adopted into the CRDT when
 * `canRoundTrip` proves serialize(parse(html)) === html, byte for byte. The feature can therefore
 * never corrupt a page it does not completely understand; the worst case is that a page is not live.
 *
 * Light pages are the controlled subset this needs to cover: they are written by the composer prompt or
 * emitted by the canvas `serializeDom`, so they are well-formed and browser-normalised in practice.
 */

/**
 * One attribute, split into the part that carries meaning and the part that carries formatting.
 * `rawSuffix` is everything the source had after the name — `="a"`, `=a`, `\n  = 'a'`, or `""` for a
 * boolean attribute. Keeping it verbatim is what makes an untouched attribute reserialize unchanged.
 */
export type LightAttr = {
  /** Whitespace between the previous token and this attribute's name (never empty in valid source). */
  pre: string;
  name: string;
  rawSuffix: string;
};

export type LightNode =
  | {
      kind: "element";
      name: string;
      attrs: LightAttr[];
      /** Whitespace before the closing `>` (or before `/>`). */
      post: string;
      /** The source wrote `/>`. Void elements are usually written without it. */
      selfClosing: boolean;
      children: LightNode[];
    }
  | { kind: "text"; value: string }
  /** Raw inner text, between `<!--` and `-->`. */
  | { kind: "comment"; value: string }
  /** Raw inner text, between `<!` and `>` — e.g. `doctype html`. */
  | { kind: "doctype"; value: string };

/** Elements that never have children or an end tag. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Elements whose content is text, not markup. A `<` inside them opens nothing — which is exactly why
 * light pages can carry a `<style>` block full of `>` child combinators without confusing the parser.
 */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

export function isVoidElement(name: string): boolean {
  return VOID_ELEMENTS.has(name.toLowerCase());
}

export function isRawTextElement(name: string): boolean {
  return RAW_TEXT_ELEMENTS.has(name.toLowerCase());
}

const isSpace = (c: string): boolean => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

/** A cursor into the source. Mutated as the scanner advances. */
type Cursor = { i: number };

function readWhile(src: string, p: Cursor, pred: (c: string) => boolean): string {
  const start = p.i;
  while (p.i < src.length && pred(src[p.i]!)) p.i += 1;
  return src.slice(start, p.i);
}

/**
 * Parse a light page into a source-faithful tree, or `null` if any of it cannot be modelled exactly.
 * Refusing is a feature: see the file header.
 */
export function parseLightHtml(src: string): LightNode[] | null {
  const p: Cursor = { i: 0 };
  const nodes = parseNodes(src, p, []);
  if (nodes === null) return null;
  // Anything left over is a stray end tag with no open element to close. Refuse rather than swallow it
  // as text: it would round-trip byte-identically while modelling the document wrongly, which is worse
  // than not adopting the page at all.
  if (p.i < src.length) return null;
  return nodes;
}

/**
 * Parse children until EOF or an end tag belonging to `open` (an ancestor). Leaves the cursor at that
 * end tag for the caller. Returns `null` on anything unmodellable.
 */
function parseNodes(src: string, p: Cursor, open: string[]): LightNode[] | null {
  const out: LightNode[] = [];
  while (p.i < src.length) {
    const c = src[p.i]!;
    if (c !== "<") {
      out.push({ kind: "text", value: readWhile(src, p, (ch) => ch !== "<") });
      continue;
    }
    const next = src[p.i + 1];
    if (next === "!") {
      if (src.startsWith("<!--", p.i)) {
        const end = src.indexOf("-->", p.i + 4);
        if (end === -1) return null;
        out.push({ kind: "comment", value: src.slice(p.i + 4, end) });
        p.i = end + 3;
        continue;
      }
      const end = src.indexOf(">", p.i + 2);
      if (end === -1) return null;
      out.push({ kind: "doctype", value: src.slice(p.i + 2, end) });
      p.i = end + 1;
      continue;
    }
    if (next === "/") {
      // An end tag. Ours to stop at only if it closes something open; otherwise it is stray.
      const name = readEndTagName(src, p.i);
      if (name === null) return null;
      if (!open.some((o) => o.toLowerCase() === name.toLowerCase())) return null;
      return out;
    }
    if (next === undefined || !isNameStart(next)) return null;
    const el = parseElement(src, p, open);
    if (el === null) return null;
    out.push(el);
  }
  return out;
}

const isNameStart = (c: string): boolean => /[a-zA-Z]/.test(c);

/** The tag name of the end tag at `at`, or `null` if it is not a well-formed `</name>`. */
function readEndTagName(src: string, at: number): string | null {
  const p: Cursor = { i: at + 2 };
  const name = readWhile(src, p, (c) => !isSpace(c) && c !== ">");
  if (!name) return null;
  if (src[p.i] !== ">") return null;
  return name;
}

function parseElement(src: string, p: Cursor, open: string[]): LightNode | null {
  p.i += 1; // past '<'
  const name = readWhile(src, p, (c) => !isSpace(c) && c !== ">" && c !== "/");
  if (!name) return null;

  const attrs: LightAttr[] = [];
  let post = "";
  let selfClosing = false;
  for (;;) {
    if (p.i >= src.length) return null;
    const ws = readWhile(src, p, isSpace);
    const c = src[p.i];
    if (c === ">") {
      post = ws;
      p.i += 1;
      break;
    }
    if (c === "/" && src[p.i + 1] === ">") {
      post = ws;
      p.i += 2;
      selfClosing = true;
      break;
    }
    if (c === undefined) return null;
    const attr = parseAttr(src, p, ws);
    if (attr === null) return null;
    attrs.push(attr);
  }

  const element: LightNode = { kind: "element", name, attrs, post, selfClosing, children: [] };
  if (selfClosing || isVoidElement(name)) return element;

  if (isRawTextElement(name)) {
    // Content runs verbatim to the matching end tag — no markup inside.
    const close = findRawTextEnd(src, p.i, name);
    if (close === -1) return null;
    const text = src.slice(p.i, close);
    if (text) element.children.push({ kind: "text", value: text });
    p.i = close;
  } else {
    const children = parseNodes(src, p, [...open, name]);
    if (children === null) return null;
    element.children = children;
  }

  // Whatever we stopped at must be this element's own end tag, written plainly.
  const endName = p.i < src.length ? readEndTagName(src, p.i) : null;
  if (endName === null || endName.toLowerCase() !== name.toLowerCase()) return null;
  if (endName !== name) return null; // a case-shifted end tag would not reserialize
  p.i += endName.length + 3;
  return element;
}

/** Index of the `</name` that closes a raw-text element, or -1. */
function findRawTextEnd(src: string, from: number, name: string): number {
  const lower = src.toLowerCase();
  const needle = `</${name.toLowerCase()}`;
  let at = from;
  for (;;) {
    const hit = lower.indexOf(needle, at);
    if (hit === -1) return -1;
    const after = src[hit + needle.length];
    // `</style>` closes; `</styles>` does not.
    if (after === ">" || after === undefined || isSpace(after)) return hit;
    at = hit + needle.length;
  }
}

function parseAttr(src: string, p: Cursor, pre: string): LightAttr | null {
  const start = p.i;
  const name = readWhile(src, p, (c) => !isSpace(c) && c !== "=" && c !== ">" && c !== "/");
  if (!name) return null;
  const afterName = p.i;

  // `attr = "v"` is legal, and the whitespace around `=` belongs to this attribute, not the next one.
  // If what follows the name is not an `=`, rewind so that whitespace becomes the next attribute's `pre`.
  const ws = readWhile(src, p, isSpace);
  if (src[p.i] !== "=") {
    p.i = afterName;
    void ws;
    return { pre, name, rawSuffix: "" };
  }
  p.i += 1;
  readWhile(src, p, isSpace);
  const q = src[p.i];
  if (q === '"' || q === "'") {
    const end = src.indexOf(q, p.i + 1);
    if (end === -1) return null;
    p.i = end + 1;
  } else {
    const unquoted = readWhile(src, p, (c) => !isSpace(c) && c !== ">");
    if (!unquoted) return null;
  }
  return { pre, name, rawSuffix: src.slice(afterName, p.i) };
}

/** Serialize a tree back to HTML. Exact for a tree that came from `parseLightHtml`. */
export function serializeLightHtml(nodes: readonly LightNode[]): string {
  let out = "";
  for (const n of nodes) out += serializeNode(n);
  return out;
}

function serializeNode(n: LightNode): string {
  switch (n.kind) {
    case "text":
      return n.value;
    case "comment":
      return `<!--${n.value}-->`;
    case "doctype":
      return `<!${n.value}>`;
    case "element": {
      let out = `<${n.name}`;
      for (const a of n.attrs) out += `${a.pre}${a.name}${a.rawSuffix}`;
      out += `${n.post}${n.selfClosing ? "/" : ""}>`;
      if (n.selfClosing || isVoidElement(n.name)) return out;
      out += serializeLightHtml(n.children);
      return `${out}</${n.name}>`;
    }
  }
}

/**
 * The adoption gate: can this page be modelled without changing a single byte? Everything downstream —
 * the CRDT, live editing, writing from converged state — is allowed to run only when this is true.
 */
export function canRoundTrip(html: string): boolean {
  const tree = parseLightHtml(html);
  if (tree === null) return false;
  return serializeLightHtml(tree) === html;
}

const ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&apos;", "'"],
];

/**
 * The attribute's decoded value — what an edit reads and writes. Formatting stays in `rawSuffix`; this
 * is the half that goes into the CRDT, so two people changing `class` and `style` on the same element
 * are changing two separate values rather than two copies of one string.
 */
export function attrValue(rawSuffix: string): string {
  if (rawSuffix === "") return "";
  const eq = rawSuffix.indexOf("=");
  if (eq === -1) return "";
  let raw = rawSuffix.slice(eq + 1).trim();
  const q = raw[0];
  if ((q === '"' || q === "'") && raw.endsWith(q) && raw.length >= 2) raw = raw.slice(1, -1);
  let out = raw;
  for (const [entity, char] of ENTITIES) out = out.split(entity).join(char);
  return out;
}

/** The source form to write for a value that an edit has changed. Double-quoted, minimally escaped. */
export function makeRawSuffix(value: string): string {
  const escaped = value.split("&").join("&amp;").split('"').join("&quot;").split("<").join("&lt;");
  return `="${escaped}"`;
}
