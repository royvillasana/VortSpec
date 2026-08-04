/**
 * TRANSCRIPT fixture — real values captured from a real design file, replayed.
 *
 * It does NOT execute Figma. Thor's point stands: calling it "live" overstated the boundary. What
 * it proves is that the parser and the prompt handle what Figma actually produced, which synthetic
 * data cannot — the node ids, the library key and the findings below were observed, not invented.
 * It proves nothing about the Figma API's behaviour today.
 *
 * Source: "Design Engineering System | Small", fileKey `JiUGxcr4u8Jj4FiV429ioK`, read
 * 2026-08-04 through the remote Figma MCP with the Desktop Bridge NOT connected (the
 * `bridgeConnected: false` path). Every value below was returned by an actual tool call.
 *
 * The point of this file is that the synthetic tests can only prove the parser handles the
 * shapes I imagined. These prove it handles what Figma actually produced — including the two
 * traps the live run exposed: the 3-page listing cap, and `search_design_system` returning
 * same-named components from twenty unrelated libraries.
 */
import { describe, expect, it } from "vitest";
import {
  buildFigmaHygieneAuditPrompt,
  parseHygieneAuditResult,
  rosterPatchFromAudit,
} from "./figma-hygiene";

const FILE_URL =
  "https://www.figma.com/design/JiUGxcr4u8Jj4FiV429ioK/Design-Engineering-System-%7C-Small";

/** The library key the live search returned for this file's OWN library. */
const OWN_LIBRARY =
  "lk-8e2c1d2065cc5aad3cd342725360bb66ad245841b1bba49eb8a8cd561ca211dc48b6f4502082c0576cf4104af57ff371dd37f22f222cbbbc48ece29fe526fb5e";

/**
 * Verbatim `RESULT:` line for what the live read actually found. Node ids are real ids from
 * the `Screens` page (8585:757); component keys are real keys from the scoped library search.
 */
const TRANSCRIPT_RESULT = `Audit complete.
RESULT: ${JSON.stringify({
  components: [
    {
      name: "button",
      nodeId: "8589:769",
      libraryKey: OWN_LIBRARY,
      pageId: "8585:757",
      pageName: "Screens",
      variantAxes: [],
      hasDescription: true,
      unboundValues: 0,
      issues: [
        "no page named 'button' — page-per-component anchor absent; found only on the Screens page as an instance",
        "name 'button' matched 20 component sets across 20 libraries when the search was not scoped by library key",
      ],
    },
    {
      name: "Navbar",
      nodeId: "8588:758",
      libraryKey: OWN_LIBRARY,
      pageId: "8585:757",
      pageName: "Screens",
      variantAxes: [],
      hasDescription: false,
      unboundValues: 0,
      issues: ["no description"],
    },
    {
      name: "spacer",
      nodeId: "8612:1452",
      libraryKey: OWN_LIBRARY,
      pageId: "8585:757",
      pageName: "Screens",
      variantAxes: [],
      hasDescription: false,
      unboundValues: 0,
      issues: ["case-variant duplicate: both 'spacer' and 'Spacer' are in use"],
    },
    {
      name: "Spacer",
      nodeId: "8597:771",
      libraryKey: OWN_LIBRARY,
      pageId: "8585:757",
      pageName: "Screens",
      variantAxes: [],
      hasDescription: false,
      unboundValues: 0,
      issues: ["case-variant duplicate: both 'spacer' and 'Spacer' are in use"],
    },
    {
      name: "Carousel",
      nodeId: "8595:765",
      libraryKey: OWN_LIBRARY,
      pageId: "8585:757",
      pageName: "Screens",
      variantAxes: [],
      hasDescription: false,
      unboundValues: 0,
      issues: ["no description"],
    },
    // Resolved by scoped library search but never placed on a reachable page.
    {
      name: "button-group",
      nodeId: null,
      libraryKey: OWN_LIBRARY,
      pageId: null,
      pageName: null,
      variantAxes: [],
      hasDescription: true,
      unboundValues: null,
      issues: ["in the library but not reachable on any listed page — page listing capped at 3"],
    },
  ],
  blocking: 3,
  advisory: 5,
  unresolved: ["button-group"],
})}`;

describe("figma-hygiene against a captured real-file transcript", () => {
  it("parses the live audit result", () => {
    const r = parseHygieneAuditResult(TRANSCRIPT_RESULT);
    expect(r).not.toBeNull();
    expect(r!.components).toHaveLength(6);
    expect(r!.blocking).toBe(3);
    expect(r!.unresolved).toEqual(["button-group"]);
  });

  it("patches the roster with only the components that actually resolved", () => {
    const { patch } = rosterPatchFromAudit(parseHygieneAuditResult(TRANSCRIPT_RESULT)!, OWN_LIBRARY);
    // 5 of 6 resolved; button-group did not and must not be guessed.
    expect(patch).toHaveLength(5);
    expect(patch.map((p) => p.name)).not.toContain("button-group");
    expect(patch[0]).toEqual({
      name: "button",
      figmaNodeId: "8589:769",
      figmaPage: "Screens",
      figmaPageId: "8585:757",
    });
    // This is the payload that closes the 0-of-242 gap: every entry carries a durable id.
    for (const p of patch) expect(p.figmaNodeId).toMatch(/^\d+:\d+$/);
  });

  it("surfaces the case-variant duplicate the live file actually contains", () => {
    const r = parseHygieneAuditResult(TRANSCRIPT_RESULT)!;
    const names = r.components.map((c) => c.name);
    expect(names).toContain("spacer");
    expect(names).toContain("Spacer");
    // Distinct node ids — genuinely two components, not one read twice.
    const ids = r.components.filter((c) => /^spacer$/i.test(c.name)).map((c) => c.nodeId);
    expect(new Set(ids).size).toBe(2);
  });

  it("records unbound-value counts, which this file passes — its values are variable-bound", () => {
    const r = parseHygieneAuditResult(TRANSCRIPT_RESULT)!;
    const placed = r.components.filter((c) => c.nodeId !== null);
    for (const c of placed) expect(c.unboundValues).toBe(0);
  });
});

describe("the no-bridge prompt carries both live-confirmed traps", () => {
  const p = buildFigmaHygieneAuditPrompt({
    fileUrl: FILE_URL,
    roster: [{ name: "button" }],
    bridgeConnected: false,
  });

  it("warns that the capped listing can show foundations and zero components", () => {
    expect(p).toContain("CAPS AT 3 PAGES");
    expect(p).toContain("Colors & Shadow");
    expect(p).toContain("three FOUNDATION pages and not one component");
  });

  it("requires library-key scoping, because fileKey does not filter the search", () => {
    expect(p).toContain("is NOT scoped to this file by its `fileKey`");
    expect(p).toContain("includeLibraryKeys");
    expect(p).toContain("20 component sets from 20 UNRELATED libraries");
    // The safe behaviour when only a cross-library match exists.
    expect(p).toContain("report it as unresolved rather than using it");
  });

  it("still says nothing about any UI framework", () => {
    for (const leak of ["React", "Vue", "Svelte", "Angular", "CVA", "forwardRef", "props", ".tsx"]) {
      expect(p).not.toContain(leak);
    }
  });

  it("does not carry the traps when the bridge is connected", () => {
    const bridged = buildFigmaHygieneAuditPrompt({
      fileUrl: FILE_URL,
      roster: [{ name: "button" }],
      bridgeConnected: true,
    });
    expect(bridged).not.toContain("CAPS AT 3 PAGES");
    expect(bridged).not.toContain("includeLibraryKeys");
  });

  it("uses a library key of the shape the live search returned", () => {
    expect(OWN_LIBRARY).toMatch(/^lk-[0-9a-f]{100,}$/);
  });
});
