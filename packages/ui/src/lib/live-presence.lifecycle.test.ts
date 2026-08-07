import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { docToLightHtml, lightHtmlToDoc } from "@vortspec/core/light-doc";
import { participantCount, participantsFrom, presenceColor } from "./live-presence";

/**
 * The presence lifecycle (OpenSpec change: live-playground, task 2.7), against the real awareness
 * protocol rather than a stand-in — the guarantees being checked here are the protocol's, so testing
 * a mock of it would prove nothing.
 */

const PAGE = '<!doctype html>\n<html><body><div id="a">hello</div></body></html>';

/** Two clients that can see each other, the way a relay connects them. */
const pair = () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const a = new Awareness(docA);
  const b = new Awareness(docB);
  // Relay each one's changes to the other, as Hocuspocus does.
  const link = (from: Awareness, to: Awareness): void => {
    from.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changed = [...added, ...updated, ...removed];
      applyAwarenessUpdate(to, encodeAwarenessUpdate(from, changed), "remote");
    });
  };
  link(a, b);
  link(b, a);
  return { a, b, docA, docB };
};

/** Depth-first search for the first element with a tag name. */
const findElement = (doc: Y.Doc, tag: string): Y.XmlElement | null => {
  const walk = (node: Y.XmlFragment | Y.XmlElement): Y.XmlElement | null => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === tag) return child;
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  return walk(doc.getXmlFragment("page"));
};

const setPresence = (aw: Awareness, name: string, cursor: { fp: string; fx: number; fy: number } | null): void => {
  aw.setLocalStateField("presence", { name, color: presenceColor(name), cursor });
};

describe("someone arriving and leaving", () => {
  it("appears to the other participant, with their cursor", () => {
    const { a, b } = pair();
    setPresence(a, "Roy", { fp: "main>div", fx: 0.5, fy: 0.25 });
    setPresence(b, "Ada", null);

    const seenByB = participantsFrom(b.getStates(), b.clientID);
    expect(seenByB.map((p) => p.name)).toEqual(["Roy"]);
    expect(seenByB[0]!.cursor).toEqual({ fp: "main>div", fx: 0.5, fy: 0.25 });
    expect(participantCount(b.getStates())).toBe(2);
  });

  it("removes the cursor and decrements the count on disconnect", () => {
    // The requirement in one assertion. This is the protocol's behaviour, not ours — which is the
    // reason presence lives in awareness rather than in the document.
    const { a, b } = pair();
    setPresence(a, "Roy", { fp: "main>div", fx: 0.5, fy: 0.5 });
    setPresence(b, "Ada", null);
    expect(participantCount(b.getStates())).toBe(2);

    removeAwarenessStates(a, [a.clientID], "disconnect");

    expect(participantCount(b.getStates())).toBe(1);
    expect(participantsFrom(b.getStates(), b.clientID)).toEqual([]);
  });

  it("does not revert the leaver's edits when they go", () => {
    // Presence disappearing and work disappearing are different things; conflating them would make
    // leaving a session destructive.
    const docA = lightHtmlToDoc(PAGE)!;
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const a = new Awareness(docA);

    const div = findElement(docA, "div")!;
    div.setAttribute("style", "color: red");
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    setPresence(a, "Roy", { fp: "main>div", fx: 0, fy: 0 });
    removeAwarenessStates(a, [a.clientID], "disconnect");

    expect(docToLightHtml(docB)).toContain('style="color: red"');
  });
});

describe("presence is never written to the project", () => {
  it("leaves the document byte-identical however much presence moves", () => {
    // The file is written from the document. If presence could reach the document it would reach the
    // repository, and someone's cursor would arrive in a commit.
    const doc = lightHtmlToDoc(PAGE)!;
    const before = docToLightHtml(doc);
    const aw = new Awareness(doc);

    for (let i = 0; i < 50; i += 1) {
      setPresence(aw, "Roy", { fp: "main>div", fx: i / 50, fy: 0.5 });
    }
    setPresence(aw, "Roy", null);
    removeAwarenessStates(aw, [aw.clientID], "disconnect");

    expect(docToLightHtml(doc)).toBe(before);
  });

  it("produces no document update from presence activity", () => {
    // Stronger than comparing the output: presence must not even generate an update to SEND, or it
    // would be persisted by whichever peer is writing the file.
    const doc = lightHtmlToDoc(PAGE)!;
    const aw = new Awareness(doc);
    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });

    setPresence(aw, "Roy", { fp: "x", fx: 0.1, fy: 0.2 });
    setPresence(aw, "Roy", { fp: "y", fx: 0.3, fy: 0.4 });
    removeAwarenessStates(aw, [aw.clientID], "disconnect");

    expect(updates).toBe(0);
  });
});
